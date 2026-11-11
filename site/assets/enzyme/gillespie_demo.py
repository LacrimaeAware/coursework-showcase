"""Individual reactions, repeated runs and a pointwise simulation band.

Default: the enzyme network and fixed-step algorithm on pp. 385-386 of the
Yildirim-Kazanci chapter excerpt. --timed uses exact Gillespie waiting times.
--network chain or reversible opens the earlier optional toy illustrations.
All numerical settings and percentile bands are teaching additions, not
specified in the excerpt. Count-based binding constants include volume scaling.
"""
from __future__ import annotations

import argparse
from pathlib import Path

import matplotlib.pyplot as plt
import numpy as np

RATES = (0.2, 0.5)  # Unimolecular constants, in inverse illustrative time units.
INITIAL = {"chain": (60, 40, 0), "reversible": (60, 40)}
CHANGES = {"chain": np.array([[-1, 1, 0], [0, -1, 1]]),
           "reversible": np.array([[-1, 1], [1, -1]])}
ENZYME_INITIAL = np.array([10, 40, 0, 0])  # E, S, ES, P molecule counts.
ENZYME_RATES = np.array([0.02, 0.4, 0.2])  # c1: 1/(molecule*time); c2,c3: 1/time.
ENZYME_CHANGES = np.array([[-1, -1, 1, 0], [1, 1, -1, 0], [1, 0, -1, 1]])


def enzyme_settings(initial, rates):
    state = np.asarray(initial, dtype=float)
    rates = np.asarray(rates, dtype=float)
    if (state.shape != (4,) or not np.all(np.isfinite(state)) or np.any(state < 0)
            or np.any(state != np.floor(state))):
        raise ValueError("Use four nonnegative integer counts in E,S,ES,P order.")
    if rates.shape != (3,) or not np.all(np.isfinite(rates)) or np.any(rates < 0):
        raise ValueError("Use three finite nonnegative count-based rate constants.")
    return state.astype(np.int64), rates


def enzyme_propensities(states, rates=ENZYME_RATES):
    """Binding, dissociation, catalysis, in the paper's order."""
    states = np.asarray(states)
    return np.stack((rates[0] * states[..., 0] * states[..., 1],
                     rates[1] * states[..., 2], rates[2] * states[..., 2]), axis=-1)


def enzyme_ssa(initial=ENZYME_INITIAL, rates=ENZYME_RATES, end_time=20.0, rng=None):
    state, rates = enzyme_settings(initial, rates)
    if not np.isfinite(end_time) or end_time < 0:
        raise ValueError("Use a finite nonnegative observation time.")
    rng = np.random.default_rng() if rng is None else rng
    time, times, states = 0.0, [0.0], [state.copy()]
    while time < end_time:
        propensities = enzyme_propensities(state, rates)
        total = propensities.sum()
        if total == 0:
            break
        time += rng.exponential(1 / total)
        if time > end_time:
            break
        reaction = np.searchsorted(np.cumsum(propensities), rng.random() * total, side="right")
        state = state + ENZYME_CHANGES[reaction]
        times.append(time)
        states.append(state.copy())
    return np.asarray(times), np.asarray(states)


def enzyme_ensemble(method="paper", runs=500, seed=29, dt=0.001, end_time=20.0,
                    initial=ENZYME_INITIAL, rates=ENZYME_RATES, observations=201):
    """Paper's first-order fixed-step sampler, or exact event-time SSA.

    The paper sampler includes a no-reaction interval. dt*sum(a) <= 1 is
    necessary for valid probabilities, but small dt is also needed for accuracy.
    """
    state, rates = enzyme_settings(initial, rates)
    if not isinstance(runs, (int, np.integer)) or runs < 1:
        raise ValueError("runs must be a positive integer.")
    if not np.isfinite(end_time) or end_time <= 0 or observations < 2:
        raise ValueError("Use a positive end time and at least two observations.")
    rng = np.random.default_rng(seed)
    grid = np.linspace(0, end_time, observations)
    if method == "ssa":
        paths = []
        for _ in range(runs):
            times, states = enzyme_ssa(state, rates, end_time, rng)
            paths.append(sample_timed(times, states, grid))
        return grid, np.asarray(paths)
    if method != "paper":
        raise ValueError("method must be paper or ssa.")
    if not np.isfinite(dt) or dt <= 0:
        raise ValueError("dt must be finite and positive.")
    enzyme_total = state[0] + state[2]
    substrate_total = state[1] + state[2] + state[3]
    bound = rates[0] * enzyme_total * substrate_total + (rates[1] + rates[2]) * min(
        enzyme_total, substrate_total)
    if dt * bound > 1:
        raise ValueError("dt is too large to guarantee valid probabilities; reduce dt.")
    indices = np.rint(grid / dt).astype(int)
    if np.any(np.diff(indices) <= 0) or not np.allclose(indices * dt, grid, rtol=0, atol=1e-10):
        raise ValueError("Observation times must be integer multiples of dt.")
    states = np.tile(state, (runs, 1))
    paths = np.empty((runs, observations, 4), dtype=np.int64)
    paths[:, 0] = states
    changes = np.vstack((ENZYME_CHANGES, [0, 0, 0, 0]))  # Fourth outcome: no reaction.
    point = 1
    for step in range(1, indices[-1] + 1):
        cumulative = np.cumsum(enzyme_propensities(states, rates) * dt, axis=1)
        reaction = np.sum(rng.random(runs)[:, None] >= cumulative, axis=1)
        states = states + changes[reaction]
        while point < observations and step == indices[point]:
            paths[:, point] = states
            point += 1
    return grid, paths


def draw_enzyme_figure(grid, paths, method="paper"):
    p = paths[:, :, 3]
    lower, upper = np.quantile(p, [.025, .975], axis=0, method="nearest")
    probe = np.argmin(abs(grid - 10))
    fig, axes = plt.subplots(1, 3, figsize=(15.2, 5.6))
    fig.subplots_adjust(left=.055, right=.985, bottom=.28, top=.75, wspace=.30)
    fig.suptitle("Paper example: E + S ⇄ ES → E + P", x=.055, y=.97,
                 ha="left", fontsize=20, weight="bold")
    algorithm = "Paper's fixed-step sampler" if method == "paper" else "Exact Gillespie SSA"
    fig.text(.055, .875, f"{algorithm} | {len(paths)} runs | Illustrative counts and rates; band added for learning",
             fontsize=11)
    for i, label in enumerate(("E", "S", "ES", "P")):
        axes[0].step(grid, paths[0, :, i], where="post", label=label, linewidth=1.6)
    axes[0].set(title="1. One run (sampled)", xlabel="Time (illustrative units)", ylabel="Molecules")
    axes[0].legend(frameon=False)
    axes[1].fill_between(grid, lower, upper, step="post", color="#007f86", alpha=.2,
                         label="Pointwise 95% simulation band")
    axes[1].step(grid, p[0], where="post", color="#c46b28", label="Same example run")
    axes[1].plot(grid, p.mean(axis=0), color="#007f86", linewidth=2, label="Mean across runs")
    axes[1].axvline(grid[probe], color="#5e6570", linestyle=":")
    axes[1].set(title="2. Product P across runs", xlabel="Time (illustrative units)", ylabel="P molecules")
    axes[1].legend(frameon=True, facecolor="white", edgecolor="none", framealpha=1, fontsize=8)
    values = p[:, probe]
    axes[2].hist(values, bins=np.arange(values.min()-.5, values.max()+1.5),
                 weights=np.full(len(values), 1/len(values)), color="#007f86", alpha=.8)
    for value in (lower[probe], upper[probe]):
        axes[2].axvline(value, color="#252525", linestyle="--")
    axes[2].set(title=f"3. P distribution at t = {grid[probe]:g}", xlabel="P molecules",
                ylabel="Fraction of runs")
    for ax in axes:
        ax.spines[["top", "right"]].set_visible(False)
        ax.grid(axis="y", alpha=.12)
        ax.set_ylim(bottom=0)
    axes[1].set_ylim(0, max(1, float(upper.max()) * 1.4))
    fig.text(.055, .065, "Conserved quantities: E + ES (enzyme) and S + ES + P (substrate units).\n"
             "The band shows run-to-run variation at each time. The excerpt does not prescribe a prediction-band method.",
             fontsize=10, linespacing=1.6)
    return fig


def settings(network, initial, rates):
    if network not in CHANGES:
        raise ValueError("Choose chain or reversible.")
    values = np.asarray(INITIAL[network] if initial is None else initial, dtype=float)
    rates = np.asarray(rates, dtype=float)
    if (values.shape != (CHANGES[network].shape[1],)
            or not np.all(np.isfinite(values)) or np.any(values < 0)
            or np.any(values != np.floor(values))):
        raise ValueError("Initial amounts must be nonnegative integer molecule counts.")
    if rates.shape != (2,) or not np.all(np.isfinite(rates)) or np.any(rates < 0):
        raise ValueError("Both rate constants must be finite and nonnegative.")
    return values.astype(np.int64), rates


def choose_reaction(propensities, uniform):
    """For two channels, partition [0,1) at a1/(a1+a2)."""
    return 0 if uniform < propensities[0] / propensities.sum() else 1


def event_path(network="chain", initial=None, rates=RATES, events=160, rng=None):
    """Embedded jump chain. Its horizontal coordinate is NOT physical time.

    After absorption, hold the state at subsequent requested indices. Those
    repeated rows are padding, not additional chemical reactions.
    """
    state, rates = settings(network, initial, rates)
    if not isinstance(events, (int, np.integer)) or events < 0:
        raise ValueError("events must be a nonnegative integer.")
    rng = np.random.default_rng() if rng is None else rng
    path = np.empty((events + 1, len(state)), dtype=np.int64)
    path[0] = state
    for step in range(1, events + 1):
        propensities = rates * state[:2]  # a1 = k1*A; a2 = k2*B.
        if propensities.sum() == 0:
            path[step:] = state
            break
        reaction = choose_reaction(propensities, rng.random())
        state = state + CHANGES[network][reaction]
        path[step] = state
    return path


def timed_path(network="chain", initial=None, rates=RATES, end_time=20.0, rng=None):
    """Gillespie direct method, including the exponentially distributed clock."""
    state, rates = settings(network, initial, rates)
    if not np.isfinite(end_time) or end_time < 0:
        raise ValueError("end_time must be finite and nonnegative.")
    rng = np.random.default_rng() if rng is None else rng
    time = 0.0
    times, states = [time], [state.copy()]
    while time < end_time:
        propensities = rates * state[:2]
        total = propensities.sum()
        if total == 0:
            break
        # Equivalent to -log(U)/total, with U uniform on (0,1).
        waiting_time = rng.exponential(1 / total)
        if time + waiting_time > end_time:
            break  # Do not execute a reaction outside the observation window.
        time += waiting_time
        reaction = choose_reaction(propensities, rng.random())
        state = state + CHANGES[network][reaction]
        times.append(time)
        states.append(state.copy())
    return np.asarray(times), np.asarray(states)


def sample_timed(times, states, grid):
    """Hold each integer state until its next event; never interpolate counts."""
    return states[np.searchsorted(times, grid, side="right") - 1]


def exact_mean(grid, network="chain", initial=None, rates=RATES):
    """The deterministic mean is exact for these linear reaction networks."""
    initial, rates = settings(network, initial, rates)
    t = np.asarray(grid)
    k1, k2 = rates
    a0, b0 = initial[:2]
    if network == "reversible":
        if k1 + k2 == 0:
            return np.broadcast_to(initial, (len(t), len(initial))).copy()
        equilibrium_b = (a0 + b0) * k1 / (k1 + k2)
        b = equilibrium_b + (b0 - equilibrium_b) * np.exp(-(k1 + k2) * t)
        return np.column_stack((a0 + b0 - b, b))
    a = a0 * np.exp(-k1 * t)
    if k1 == k2:
        b = (b0 + k1 * a0 * t) * np.exp(-k1 * t)
    else:
        b = b0 * np.exp(-k2 * t) + k1 * a0 * (
            np.exp(-k1 * t) - np.exp(-k2 * t)) / (k2 - k1)
    return np.column_stack((a, b, initial.sum() - a - b))


def ensemble(network="chain", timed=False, runs=500, seed=29):
    if not isinstance(runs, (int, np.integer)) or runs < 2:
        raise ValueError("Use at least two runs to show a spread.")
    rng = np.random.default_rng(seed)
    grid = np.linspace(0, 20, 201) if timed else np.arange(161)
    paths = []
    for _ in range(runs):
        if timed:
            times, states = timed_path(network, end_time=grid[-1], rng=rng)
            paths.append(sample_timed(times, states, grid))
        else:
            paths.append(event_path(network, events=int(grid[-1]), rng=rng))
    return grid, np.asarray(paths)


def draw_figure(grid, paths, network="chain", timed=False):
    # Nearest order statistics retain integer molecule counts at the band edges.
    b = paths[:, :, 1]
    lower, upper = np.quantile(b, [0.025, 0.975], axis=0, method="nearest")
    mean = b.mean(axis=0)
    probe = int(np.argmin(abs(grid - 5))) if timed else 60
    coordinate = "Time (illustrative units)" if timed else "Reaction number (not time)"
    network_label = "A → B → C" if network == "chain" else "A ⇄ B"
    fig, axes = plt.subplots(1, 3, figsize=(15.2, 5.6))
    fig.subplots_adjust(left=0.055, right=0.985, bottom=0.28, top=0.76, wspace=0.30)
    fig.suptitle(f"Individual reactions: {network_label}", x=0.055, y=0.97,
                 ha="left", fontsize=20, weight="bold")
    fig.text(0.055, 0.875,
             f"Same start each run: {INITIAL[network]} molecules    |    "
             f"k₁ = {RATES[0]}, k₂ = {RATES[1]}    |    {len(paths)} independent runs",
             fontsize=11)
    for i, label in enumerate("ABC"[:paths.shape[2]]):
        axes[0].step(grid, paths[0, :, i], where="post", label=label,
                     color=["#4c566a", "#007f86", "#c46b28"][i], linewidth=1.8)
    axes[0].set(title="1. One random run" + (" (sampled)" if timed else ""),
                xlabel=coordinate, ylabel="Molecules")
    axes[0].legend(frameon=False)
    axes[1].fill_between(grid, lower, upper, step="post", color="#007f86", alpha=0.20,
                         label="Pointwise 95% simulation band")
    axes[1].step(grid, b[0], where="post", color="#c46b28", linewidth=1,
                 label="Same example run")
    axes[1].plot(grid, mean, color="#007f86", linewidth=2, label="Mean across runs")
    if timed:
        axes[1].plot(grid, exact_mean(grid, network)[:, 1], "--", color="#252525",
                     linewidth=1.5, label="Exact mean / linear ODE")
    axes[1].axvline(grid[probe], color="#5e6570", linestyle=":")
    axes[1].set(title="2. How much can B vary?", xlabel=coordinate, ylabel="B molecules")
    axes[1].legend(frameon=False, fontsize=8, loc="upper right")
    values = b[:, probe]
    axes[2].hist(values, bins=np.arange(values.min() - 0.5, values.max() + 1.5),
                 weights=np.full(len(values), 1 / len(values)), color="#007f86", alpha=.8)
    axes[2].axvline(lower[probe], color="#252525", linestyle="--", label="Band endpoints")
    axes[2].axvline(upper[probe], color="#252525", linestyle="--")
    marker = f"t = {grid[probe]:g}" if timed else f"reaction {grid[probe]:g}"
    axes[2].set(title=f"3. B distribution at {marker}", xlabel="B molecules",
                ylabel="Fraction of runs")
    axes[2].legend(frameon=False, fontsize=9)
    for ax in axes:
        ax.spines[["top", "right"]].set_visible(False)
        ax.grid(axis="y", alpha=.12)
        ax.set_ylim(bottom=0)
    axes[1].set_ylim(0, max(1, float(upper.max()) * 1.45))
    fig.text(0.055, .065,
             "The band contains the central 95% of simulated B counts at each horizontal position.\n"
             "It describes run-to-run variation at fixed parameters, not uncertainty in the mean or a whole-path guarantee.",
             fontsize=10, linespacing=1.6)
    return fig


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--network", choices=("enzyme", *CHANGES), default="enzyme")
    parser.add_argument("--timed", action="store_true", help="Include SSA waiting times.")
    parser.add_argument("--runs", type=int, default=500)
    parser.add_argument("--seed", type=int, default=29)
    parser.add_argument("--save", type=Path)
    parser.add_argument("--no-show", action="store_true")
    args = parser.parse_args()
    if args.network == "enzyme":
        method = "ssa" if args.timed else "paper"
        grid, paths = enzyme_ensemble(method, args.runs, args.seed)
        fig = draw_enzyme_figure(grid, paths, method)
        enzyme_ok = np.all(paths[:, :, 0] + paths[:, :, 2] == 10)
        substrate_ok = np.all(paths[:, :, 1:].sum(axis=2) == 40)
        print(f"enzyme: {args.runs} runs; method={method}; nonnegative: {bool(np.all(paths >= 0))}; "
              f"enzyme and substrate balances: {bool(enzyme_ok and substrate_ok)}")
    else:
        grid, paths = ensemble(args.network, args.timed, args.runs, args.seed)
        fig = draw_figure(grid, paths, args.network, args.timed)
        print(f"{args.network}: {args.runs} optional toy runs; counts nonnegative: {bool(np.all(paths >= 0))}")
    if args.save:
        fig.savefig(args.save, dpi=150)
        print(f"Saved {args.save.name}")
    if not args.no_show:
        plt.show()
    plt.close(fig)


if __name__ == "__main__":
    main()
