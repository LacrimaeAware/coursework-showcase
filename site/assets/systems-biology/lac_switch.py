"""Two-variable TMG feedback model, Ozbudak et al. (2004), supplement S1-S8.

Run from this folder: python lac_switch.py
Save a figure: python lac_switch.py --save lac-switch-preview.png
The matched MATLAB file is lac_switch.m. Time units are illustrative, not fitted.
Install: python -m pip install numpy scipy matplotlib
DOI: 10.1038/nature02298.
"""

from __future__ import annotations

import argparse
from dataclasses import dataclass
from pathlib import Path

import matplotlib.pyplot as plt
import numpy as np
from matplotlib.widgets import Slider
from scipy.integrate import solve_ivp


# Paper fit at zero external glucose. External TMG is in micromolar.
@dataclass(frozen=True)
class Parameters:
    alpha: float = 100.5
    rho: float = 167.1
    uptake: float = 0.123
    exponent: float = 0.6
    tau_x: float = 1.0
    tau_y: float = 1.0


P = Parameters()
INPUTS = np.linspace(0.0, 40.0, 401)
TIMES = np.linspace(0.0, 80.0, 320)
LOW_START = np.array([0.0, P.alpha / P.rho])
HIGH_START = np.array([80.0, 100.0])


def beta(external_tmg: float) -> float:
    return P.uptake * external_tmg**P.exponent


def reaction(_time: float, state: np.ndarray, external_tmg: float) -> np.ndarray:
    """State = [normalized internal TMG, LacY fluorescence]."""
    x, y = state
    dx = (beta(external_tmg) * y - x) / P.tau_x
    dy = (P.alpha * (1 + x*x) / (P.rho + x*x) - y) / P.tau_y
    return np.array([dx, dy])


def steady_states(external_tmg: float) -> list[tuple[float, bool]]:
    """Positive steady LacY levels, with local stability from the Jacobian."""
    b = beta(external_tmg)
    if b == 0:
        return [(P.alpha / P.rho, True)]
    c2 = (b * P.alpha) ** 2
    # z = y / alpha; this is supplementary Eq. S5.
    roots = np.roots([c2, -c2, P.rho, -1.0])
    states = []
    for root in roots:
        if abs(root.imag) > 1e-7 or not 0 < root.real <= 1 + 1e-8:
            continue
        y = P.alpha * root.real
        x = b * y
        slope = 2 * P.alpha * x * (P.rho - 1) / (P.rho + x*x)**2
        states.append((y, 1 - b * slope > 0))
    return sorted(states)


def state_trajectories(external_tmg: float) -> tuple[np.ndarray, np.ndarray]:
    runs = []
    for start in (LOW_START, HIGH_START):
        result = solve_ivp(
            lambda time, state: reaction(time, state, external_tmg),
            (TIMES[0], TIMES[-1]), start, t_eval=TIMES,
            rtol=1e-8, atol=1e-10,
        )
        if not result.success:
            raise RuntimeError(result.message)
        runs.append(result.y)
    return runs[0], runs[1]


def trajectories(external_tmg: float) -> tuple[np.ndarray, np.ndarray]:
    low, high = state_trajectories(external_tmg)
    return low[1], high[1]


def make_overview(external_tmg: float = 18.0) -> plt.Figure:
    """Four panels driven by one maintained external input."""
    fig, axes = plt.subplots(2, 2, figsize=(10, 7.4))
    fig.subplots_adjust(left=.10, right=.97, bottom=.09, top=.89, hspace=.46, wspace=.32)
    fig.patch.set_facecolor('white')
    colors = ('#175e86', '#bd6843')
    time_lines = []
    for k, ax in enumerate(axes[0]):
        lines = [ax.plot([], [], color=color, lw=1.8, label=label)[0]
                 for color, label in zip(colors, ('Start low', 'Start high'))]
        time_lines.append(lines)
        ax.set(xlabel='Time (illustrative units)',
               ylabel=('x (normalized)', 'y (fluorescence units)')[k],
               title=('Internal TMG', 'LacY')[k])
    axes[0, 1].legend(frameon=False, loc='center right')
    ax = axes[1, 0]
    x = np.linspace(0, max(HIGH_START[0], beta(INPUTS[-1]) * P.alpha), 300)
    production = P.alpha * (1 + x*x) / (P.rho + x*x) / P.tau_y
    ax.plot(x, production, color='#333333', lw=1.8)
    ax.set(xlim=(0, x[-1]), ylim=(0, 1.08 * P.alpha / P.tau_y),
           xlabel='Internal TMG, x (normalized)', ylabel='Production (fluor. units / time)',
           title='LacY production')
    ax = axes[1, 1]
    branches = np.full((3, len(INPUTS)), np.nan)
    for i, tmg in enumerate(INPUTS):
        for y, stable in steady_states(float(tmg)):
            branch = (0 if y < P.alpha / 2 else 1) if stable else 2
            branches[branch, i] = y
    for branch, style, label in zip(branches, ('-', '-', '--'), ('Stable', '_nolegend_', 'Unstable')):
        ax.plot(INPUTS, branch, style, color='#333333', lw=1.5, label=label)
    marker = ax.axvline(external_tmg, ls=':', color='#808080')
    selected_stable = ax.scatter([], [], s=35, color='#333333', zorder=5)
    selected_unstable = ax.scatter([], [], s=35, facecolors='white', edgecolors='#333333', zorder=5)
    ax.set(xlim=(0, 40), ylim=(.5, 1.2 * P.alpha), yscale='log',
           xlabel='External TMG (µM)', ylabel='Steady y (log scale)', title='Steady states')
    ax.legend(frameon=False, loc='center right')
    for ax in axes.flat:
        ax.spines[['top', 'right']].set_visible(False)
        ax.grid(color='#d6e0e8', alpha=.65, lw=.6)
        ax.set_axisbelow(True)
    heading = fig.suptitle('', fontsize=12, y=.97)

    def update(tmg: float) -> None:
        runs = state_trajectories(float(tmg))
        for k, ax in enumerate(axes[0]):
            for line, run in zip(time_lines[k], runs):
                line.set_data(TIMES, run[k])
            ax.set(xlim=(0, TIMES[-1]), ylim=(0, 1.08 * max(run[k].max() for run in runs)))
        marker.set_xdata([tmg, tmg])
        states = steady_states(float(tmg))
        selected_stable.set_offsets(np.array([[tmg, y] for y, stable in states if stable]).reshape(-1, 2))
        selected_unstable.set_offsets(np.array([[tmg, y] for y, stable in states if not stable]).reshape(-1, 2))
        heading.set_text(f'TMG = {tmg:.1f} µM')
        fig.canvas.draw_idle()

    fig._update_tmg = update
    update(external_tmg)
    return fig


def make_figure(external_tmg: float = 18.0, interactive: bool = True) -> plt.Figure:
    fig = make_overview(external_tmg)
    if interactive:
        controls = plt.figure(figsize=(6.2, 1.6))
        controls.canvas.manager.set_window_title('TMG control')
        controls.patch.set_facecolor('white')
        controls.text(.06, .75, 'External TMG (µM)', fontsize=12)
        readout = controls.text(.94, .75, f'{external_tmg:.1f}', ha='right', fontsize=12)
        slider_ax = controls.add_axes((.08, .30, .84, .16))
        slider = Slider(slider_ax, '', 0, 40, valinit=external_tmg,
                        valstep=.1, color='#175e86')
        slider.valtext.set_visible(False)
        slider_ax.set_axis_on()
        slider_ax.set_xticks([0, 10, 20, 30, 40])
        slider_ax.set_yticks([])
        slider_ax.spines[:].set_visible(False)
        slider_ax.tick_params(axis='x', length=0, pad=5)

        def update(tmg: float) -> None:
            if plt.fignum_exists(fig.number):
                fig._update_tmg(float(tmg))
            readout.set_text(f'{tmg:.1f}')
            controls.canvas.draw_idle()

        slider.on_changed(update)
        fig._tmg_slider = slider
        fig._tmg_controls = controls
    return fig


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--save', type=Path, help='Save the four-panel figure instead of opening windows')
    parser.add_argument('--overview', action='store_true', help='Open only the four-panel figure')
    args = parser.parse_args()
    if args.save:
        plt.switch_backend('Agg')
        fig = make_overview()
        args.save.parent.mkdir(parents=True, exist_ok=True)
        fig.savefig(args.save, dpi=180, facecolor=fig.get_facecolor())
        print(args.save)
        plt.close(fig)
    else:
        make_figure(interactive=not args.overview)
        plt.show()


if __name__ == '__main__':
    main()
