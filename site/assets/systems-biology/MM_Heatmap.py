from pathlib import Path

import matplotlib.pyplot as plt
import numpy as np

# Parameters
E0_values = np.arange(5, 51, 5)
S0_values = np.arange(100, 801, 100)
observationTime = 100
timeValues = np.array([20, 50, 100, 200, 500])
show3D = True
sliceWidth = 0  # 0 = snapshot; 10 = average over the last 10 time units
num_of_Runs = 200
species = 'P'  # E, S, ES or P
k1 = 0.001
km1 = 0.01
k2 = 0.03


def simulate_series(E0, S0, times, rng, sliceWidth=0, return_path=False):
    times = np.asarray(times)
    assert 0 <= sliceWidth <= times.min()
    endTime = times.max()
    E, S, ES, P = int(E0), int(S0), 0, 0
    t = 0.0
    tHist = [0.0]
    stateHist = [(E, S, ES, P)]

    while t < endTime:
        v1 = k1 * E * S
        vm1 = km1 * ES
        v2 = k2 * ES
        vTotal = v1 + vm1 + v2
        if vTotal <= 0:
            break
        dt = rng.exponential(1 / vTotal)
        if t + dt > endTime:
            break
        t += dt
        r2 = rng.random()

        if r2 < v1 / vTotal:
            E -= 1
            S -= 1
            ES += 1
        elif r2 < (v1 + vm1) / vTotal:
            E += 1
            S += 1
            ES -= 1
        else:
            E += 1
            ES -= 1
            P += 1
        tHist.append(t)
        stateHist.append((E, S, ES, P))

    assert min(E, S, ES, P) >= 0
    assert E + ES == E0 and S + ES + P == S0
    tHist, stateHist = np.asarray(tHist), np.asarray(stateHist)
    if return_path:
        return tHist, stateHist
    if sliceWidth == 0:
        return stateHist[np.searchsorted(tHist, times, side='right')-1]
    ends = np.r_[tHist[1:], endTime]
    result = []
    for time in times:
        duration = np.maximum(0, np.minimum(ends, time)-np.maximum(tHist, time-sliceWidth))
        result.append(duration @ stateHist / sliceWidth)
    return np.array(result)


def simulate(E0, S0, observationTime, rng, sliceWidth=0):
    return simulate_series(E0, S0, [observationTime], rng, sliceWidth)[0]


def calculate_time_maps():
    assert 0 <= sliceWidth <= observationTime
    times = np.unique(np.r_[timeValues, observationTime])
    times = times[times >= sliceWidth]
    rng = np.random.default_rng(1108)
    species_index = ('E', 'S', 'ES', 'P').index(species)
    meanByTime = np.zeros((len(S0_values), len(E0_values), len(times)))
    sdByTime = np.zeros_like(meanByTime)

    for a, S0 in enumerate(S0_values):
        for b, E0 in enumerate(E0_values):
            counts = np.zeros((num_of_Runs, len(times)))
            for j in range(num_of_Runs):
                states = simulate_series(E0, S0, times, rng, sliceWidth)
                counts[j] = states[:, species_index]

            meanByTime[a, b] = counts.mean(axis=0)
            sdByTime[a, b] = counts.std(axis=0, ddof=1)

    CVbyTime = np.full_like(meanByTime, np.nan)
    np.divide(sdByTime, meanByTime, out=CVbyTime, where=meanByTime > 0)
    return times, CVbyTime, meanByTime, sdByTime


def calculate_map():
    times, cv, mean, sd = calculate_time_maps()
    selected = np.flatnonzero(times == observationTime)[0]
    return cv[:, :, selected], mean[:, :, selected], sd[:, :, selected]


def draw_map(CV):
    fig = plt.figure(1, figsize=(9.8, 6.8), facecolor='white')
    fig.clear()
    ax = fig.add_axes([0.14, 0.15, 0.62, 0.68])
    cmap = plt.get_cmap('viridis').copy()
    cmap.set_bad('lightgray')
    dx = E0_values[1] - E0_values[0]
    dy = S0_values[1] - S0_values[0]
    finiteCV = CV[np.isfinite(CV)]
    cvMax = finiteCV.max() if finiteCV.size else 0
    if cvMax == 0:
        cvMax = 1
    image = ax.imshow(CV, origin='lower', aspect='auto', interpolation='nearest',
                      cmap=cmap, vmin=0, vmax=cvMax,
                      extent=[E0_values[0]-dx/2, E0_values[-1]+dx/2,
                              S0_values[0]-dy/2, S0_values[-1]+dy/2])
    names = {'E': 'Free enzyme E', 'S': 'Free substrate S', 'ES': 'Complex ES', 'P': 'Product P'}
    timeLabel = (f'At time {observationTime}' if sliceWidth == 0 else
                 f'Average from time {observationTime-sliceWidth} to {observationTime}')
    labels = [f'{names[species]} variability', timeLabel]
    if np.isnan(CV).any():
        labels.append('Gray: mean is zero, so CV is undefined')
    ax.set(xlabel=r'Initial enzyme $E_0$ (molecules)',
           ylabel=r'Initial substrate $S_0$ (molecules)',
           xticks=E0_values, yticks=S0_values)
    ax.tick_params(labelsize=12, direction='out')
    ax.set_title('\n'.join(labels), fontsize=14, fontfamily='Arial', fontweight='normal', pad=12)
    ax.xaxis.label.set_size(12)
    ax.yaxis.label.set_size(12)
    cax = fig.add_axes([0.81, 0.15, 0.028, 0.68])
    cb = fig.colorbar(image, cax=cax, label='Relative variability (CV)')
    cb.ax.tick_params(labelsize=12)
    cb.ax.yaxis.label.set_size(12)
    return fig


if __name__ == '__main__':
    times, CVbyTime, meanByTime, sdByTime = calculate_time_maps()
    selected = np.flatnonzero(times == observationTime)[0]
    CV = CVbyTime[:, :, selected]
    figure = draw_map(CV)
    figure.savefig(Path(__file__).with_suffix('.png'), dpi=160)
    if show3D:
        from MM_Surface import draw_surface
        surface = draw_surface(E0_values, S0_values, CVbyTime, times,
                               observationTime, species, sliceWidth)
        surface.savefig(Path(__file__).with_name('MM_Surface.png'), dpi=160)
    plt.show()
