# Neural-network Moon ephemeris (experimental)

## What it is

A small learned propagator for the Moon's geocentric state, trained with
reinforcement-learning tooling. Each 6 h step is a classic two-body RK4 integration
(Earth + Moon, 24 substeps) plus a correction predicted by an MLP (10 → 3×512 SiLU → 6).
The correction mainly captures the solar tidal perturbation (about 5.6 km per 6 h) that
two-body physics misses. The MLP inputs are the Moon state and the Sun direction and
distance, and the Sun comes from an analytic formula (Meeus, ch. 25). Longer horizons are
produced autoregressively: 30 days = 120 steps from a single true initial state.

Training ran in two stages:

1. **Behaviour cloning** on one-step corrections, which gives the base model.
2. **PPO fine-tuning.** The agent rolls out its own predictions, and the reward is the
   negative position error versus JPL Horizons at every step, over 30-day episodes. The
   critic is asymmetric and best-on-validation checkpoints are selected.

The ported model runs in pure Rust (`src/ppo.rs`). It serves the "Moon position X time
from now" prediction (`/api/moon_predict`) and the NN-vs-DE440s comparison
(`/api/ppo_check`); `/api/track` keeps using ANISE + DE440s. The PPO model is the default
there and the base model can be selected.

## Data

Geocentric Moon and Sun state vectors come from the
[JPL Horizons API](https://ssd.jpl.nasa.gov/horizons/) at a 6 h step. They are in the
ecliptic J2000 frame, use the TDB time scale, are in km and km/s, and are geometric. The
data is split chronologically, with no overlap between splits:

| split | years | use |
|---|---|---|
| train | 1950–2020 | fitting the model |
| validation | 2021–2023 | checkpoint selection |
| test | 2024–2027 | reported results |

## Accuracy

The table gives the median Moon position error versus Horizons on the test set, over 1433
start epochs:

| model | 6 h | 1 day | 7 days | 27 days |
|---|---|---|---|---|
| two-body only | 5.56 km | 88.8 km | 4005 km | 21 239 km |
| base, `moon_nn_primary.json` | 0.001 km | 0.015 km | 0.64 km | 5.60 km |
| PPO 30-day, `moon_nn_ppo30d.json` | 0.005 km | 0.025 km | 0.79 km | 5.90 km |

PPO lowered the 30-day validation error from 7.27 to 5.44 km, but that gain did not carry
over to the test years: on 2024–2027 the base model is slightly more accurate at every
horizon (about 5% at 27 days). The team chose the PPO model as the website default because
it is the reinforcement-learning result; the base model stays available as an option. (The
file name `moon_nn_primary.json` predates that choice.)

Seen from a lunar south-pole site over 30 days, the Earth and Sun directions agree with
Horizons to within 0.004°. About 0.0008° of that comes from the network; the rest comes
from the analytic Sun model and the lunar rotation model.

## Limitations

- **Accuracy:** the model is less accurate than DE440s, roughly 3–4× larger angular error
  at 30 days, and the error grows with horizon (≈0.005° for the Earth direction after
  120 days). It is not used for any mission-relevant output.
- **Validity range:** the model is only validated for 1950–2027 and inputs on or near
  the true orbit.
- **Sun model:** the analytic Sun model is accurate to 35″.

## Use of AI

The model, training code, export and this note were written with the help of Claude
(Anthropic), an AI assistant, under the team's direction. The team reviewed all results.
