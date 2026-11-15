//! Learned lunar ephemeris (R1's model) checked against ANISE DE440s.
//!
//! Model: a two-body RK4 step of the geocentric Moon state plus an MLP residual
//! correction, fine-tuned with PPO for 30-day autoregressive rollouts. It is used
//! only by `/api/ppo_check`; every other number in the app comes from ANISE.
//! Details and provenance: docs/PPO.md.
#![allow(dead_code)] // TODO(PPO): remove once the weights loader and endpoint use everything

/// Mean obliquity of the ecliptic at J2000 (IAU 2006), arcseconds.
pub const OBLIQUITY_J2000_ARCSEC: f64 = 84_381.448;

type V3 = [f64; 3];

/// Ecliptic J2000 -> equatorial J2000 (EME2000): rotation about +X by the obliquity.
pub fn ecl_to_eq(v: V3) -> V3 {
    let (s, c) = (OBLIQUITY_J2000_ARCSEC / 3600.0).to_radians().sin_cos();
    [v[0], c * v[1] - s * v[2], s * v[1] + c * v[2]]
}

/// Equatorial J2000 (EME2000) -> ecliptic J2000.
pub fn eq_to_ecl(v: V3) -> V3 {
    let (s, c) = (OBLIQUITY_J2000_ARCSEC / 3600.0).to_radians().sin_cos();
    [v[0], c * v[1] + s * v[2], -s * v[1] + c * v[2]]
}

/// Two-body acceleration, km/s^2.
fn accel(r: V3, mu: f64) -> V3 {
    let d = (r[0] * r[0] + r[1] * r[1] + r[2] * r[2]).sqrt();
    let k = -mu / (d * d * d);
    [k * r[0], k * r[1], k * r[2]]
}

fn axpy(a: f64, x: V3, y: V3) -> V3 {
    [y[0] + a * x[0], y[1] + a * x[1], y[2] + a * x[2]]
}

/// Classic RK4 for the two-body problem: `substeps` steps covering `dt_s` seconds.
pub fn two_body_rk4(mut r: V3, mut v: V3, mu: f64, dt_s: f64, substeps: usize) -> (V3, V3) {
    let h = dt_s / substeps as f64;
    for _ in 0..substeps {
        let (k1r, k1v) = (v, accel(r, mu));
        let (k2r, k2v) = (axpy(h / 2.0, k1v, v), accel(axpy(h / 2.0, k1r, r), mu));
        let (k3r, k3v) = (axpy(h / 2.0, k2v, v), accel(axpy(h / 2.0, k2r, r), mu));
        let (k4r, k4v) = (axpy(h, k3v, v), accel(axpy(h, k3r, r), mu));
        for i in 0..3 {
            r[i] += h / 6.0 * (k1r[i] + 2.0 * k2r[i] + 2.0 * k3r[i] + k4r[i]);
            v[i] += h / 6.0 * (k1v[i] + 2.0 * k2v[i] + 2.0 * k3v[i] + k4v[i]);
        }
    }
    (r, v)
}

/// One dense layer, weights row-major `[out][in]`.
#[derive(Debug, Clone, serde::Deserialize)]
pub struct Layer {
    pub weight: Vec<Vec<f64>>,
    pub bias: Vec<f64>,
}

/// Multilayer perceptron: SiLU on hidden layers, linear output.
#[derive(Debug, Clone, serde::Deserialize)]
pub struct Mlp {
    pub layers: Vec<Layer>,
}

fn silu(x: f64) -> f64 {
    x / (1.0 + (-x).exp())
}

impl Mlp {
    pub fn forward(&self, x: &[f64]) -> Vec<f64> {
        let mut a = x.to_vec();
        let last = self.layers.len().saturating_sub(1);
        for (i, l) in self.layers.iter().enumerate() {
            let mut out: Vec<f64> = l
                .weight
                .iter()
                .zip(&l.bias)
                .map(|(row, b)| row.iter().zip(&a).map(|(w, x)| w * x).sum::<f64>() + b)
                .collect();
            if i < last {
                out.iter_mut().for_each(|z| *z = silu(*z));
            }
            a = out;
        }
        a
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn obliquity_rotation_round_trip() {
        let v = [1.0, 2.0, 3.0];
        let back = eq_to_ecl(ecl_to_eq(v));
        assert!((0..3).all(|i| (back[i] - v[i]).abs() < 1e-12));
        // The ecliptic pole is 23.44 deg from the celestial pole.
        let pole = ecl_to_eq([0.0, 0.0, 1.0]);
        assert!((pole[2].acos().to_degrees() - 23.439_291).abs() < 1e-5);
    }

    #[test]
    fn rk4_keeps_a_circular_orbit() {
        let mu: f64 = 403_503.0; // Earth + Moon GM, km^3/s^2
        let r0: f64 = 384_400.0;
        let v0 = (mu / r0).sqrt();
        let period = 2.0 * std::f64::consts::PI * (r0.powi(3) / mu).sqrt();
        let (r, v) = two_body_rk4([r0, 0.0, 0.0], [0.0, v0, 0.0], mu, period, 24 * 112);
        let rn = (r[0] * r[0] + r[1] * r[1] + r[2] * r[2]).sqrt();
        assert!((rn - r0).abs() < 1e-3, "{rn}");
        assert!((r[0] - r0).abs() < 1e-2 && r[1].abs() < 1.0, "{r:?}");
        assert!((v[1] - v0).abs() < 1e-8);
    }

    #[test]
    fn mlp_forward_with_silu() {
        let m = Mlp {
            layers: vec![
                Layer {
                    weight: vec![vec![1.0, -1.0], vec![0.5, 0.5]],
                    bias: vec![0.0, 1.0],
                },
                Layer {
                    weight: vec![vec![2.0, 1.0]],
                    bias: vec![-1.0],
                },
            ],
        };
        let y = m.forward(&[1.0, 1.0]);
        // hidden = silu([0, 2]) = [0, 2 / (1 + e^-2)]
        let want = 2.0 * 0.0 + 2.0 / (1.0 + (-2.0f64).exp()) - 1.0;
        assert!((y[0] - want).abs() < 1e-12);
    }
}
