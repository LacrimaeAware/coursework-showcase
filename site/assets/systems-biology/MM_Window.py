from pathlib import Path
import csv

import matplotlib.pyplot as plt
from matplotlib.lines import Line2D
from matplotlib.ticker import MaxNLocator
import numpy as np

from MM_Heatmap import simulate_series

# Parameters
E0 = 10
S0 = 300
targetTime = 100
f = 2  # Half-width: select targetTime-f < time < targetTime+f.
num_of_Runs = 200


def calculate_demo(E0=E0, S0=S0, targetTime=targetTime, f=f,
                   num_of_Runs=num_of_Runs, seed=1109):
    assert 0 < f <= targetTime and num_of_Runs >= 2
    endTime = targetTime + max(10, 3*f)
    rng = np.random.default_rng(seed)
    paths, selected = [], []
    snapshotP = np.zeros(num_of_Runs, dtype=int)
    for j in range(num_of_Runs):
        time, states = simulate_series(E0, S0, [endTime], rng, return_path=True)
        prod = states[:, 3]
        IND = np.flatnonzero((time > targetTime-f) & (time < targetTime+f))
        paths.append((time, prod))
        selected.append(IND)
        snapshotP[j] = prod[np.searchsorted(time, targetTime, side='right')-1]
    meanP = snapshotP.mean()
    sdP = snapshotP.std(ddof=1)
    return dict(E0=E0, S0=S0, targetTime=targetTime, f=f, endTime=endTime,
                paths=paths, selected=selected, snapshotP=snapshotP,
                meanP=meanP, sdP=sdP, cvP=sdP/meanP if meanP > 0 else np.nan)


def draw_window(data):
    fig = plt.figure(3, figsize=(9.8, 6.8), facecolor='white')
    fig.clear()
    ax = fig.add_axes([.12, .61, .82, .24])
    hist = fig.add_axes([.12, .13, .82, .24])
    time, half = data['targetTime'], data['f']
    lower, upper = time-half, time+half
    ax.axvspan(lower, upper, color='#fbe5ce')
    ax.axvline(time, color='.4', ls='--', lw=1)
    for j, ((t, prod), IND) in enumerate(zip(data['paths'][:5], data['selected'][:5])):
        ax.step(np.r_[t, data['endTime']], np.r_[prod, prod[-1]],
                where='post', color='#34699a', lw=1.4)
        ax.plot(t[IND], prod[IND], 'o', color='#c46b18', ms=5)
        ax.plot(time, data['snapshotP'][j], 'D', color='black', ms=5)
    ax.set(xlim=(time-max(10, 3*half), data['endTime']),
           xlabel='Time', ylabel='Product P (molecules)')
    # Only the visible part of the trajectories sets the vertical range.
    visible = []
    for t, prod in data['paths'][:5]:
        left = max(0, np.searchsorted(t, ax.get_xlim()[0], side='right')-1)
        visible.extend(prod[left:])
    ax.set_ylim(min(visible)-1, max(visible)+1)
    ax.set_title(f'Five separate runs; window {lower:g} to {upper:g}', fontsize=12, pad=10)
    counts = data['snapshotP']
    bins = np.arange(counts.min()-.5, counts.max()+1.5)
    hist.hist(counts, bins=bins, color='#34699a', edgecolor='white')
    hist.set(xlabel='Product P (molecules)', ylabel='Number of runs')
    hist.set_title(f'All {len(counts)} runs, each read at time {time:g}', fontsize=12, pad=10)
    for panel in (ax, hist):
        panel.tick_params(labelsize=10)
        panel.xaxis.set_major_locator(MaxNLocator(integer=True, nbins=8))
        panel.yaxis.set_major_locator(MaxNLocator(integer=True, nbins=5))
        panel.spines[['top', 'right']].set_visible(False)
    handles = [Line2D([], [], color='#34699a', label='Individual run'),
               Line2D([], [], marker='o', color='#c46b18', ls='', label='Selected event value'),
               Line2D([], [], marker='D', color='black', ls='', label='Count at target time')]
    fig.legend(handles=handles, loc='center', bbox_to_anchor=(.53, .48),
               ncol=3, frameon=False, fontsize=10)
    fig.suptitle('Classroom time-window selection', fontsize=14, y=.97)
    fig.text(.53, .91, f'Initial enzyme {data["E0"]}; initial substrate {data["S0"]}',
             ha='center', fontsize=11)
    return fig


def save_samples(data, path):
    with Path(path).open('w', newline='', encoding='utf-8') as stream:
        writer = csv.writer(stream)
        writer.writerow(['Run', 'P_at_target_time', 'Window_event_count',
                         'Selected_event_times', 'Selected_P_values'])
        for j, ((time, prod), IND) in enumerate(zip(data['paths'], data['selected'])):
            writer.writerow([j+1, data['snapshotP'][j], len(IND),
                ';'.join(f'{t:.12g}' for t in time[IND]),
                ';'.join(str(p) for p in prod[IND])])


if __name__ == '__main__':
    data = calculate_demo()
    fig = draw_window(data)
    fig.savefig(Path(__file__).with_suffix('.png'), dpi=160)
    save_samples(data, Path(__file__).with_name('MM_Window_samples.csv'))
    for j, ((time, prod), IND) in enumerate(zip(data['paths'][:5], data['selected'][:5])):
        print(f'Run {j+1}: P({targetTime})={data["snapshotP"][j]}; '
              f'selected P values={prod[IND].tolist()}')
    print(f'Across-run snapshots only: mean={data["meanP"]:.3f}, '
          f'SD={data["sdP"]:.3f}, CV={data["cvP"]:.3f}')
    print('Window values stay separate by run in MM_Window_samples.csv; no pooled window CV.')
    plt.show()
