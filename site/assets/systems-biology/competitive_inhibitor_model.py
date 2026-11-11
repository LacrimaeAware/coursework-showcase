"""
Competitive inhibitor model for a Michaelis-Menten enzyme system.

Reaction network
----------------
E + S <-> ES -> E + P
E + I <-> EI

E  : free enzyme
S  : free substrate
ES : enzyme-substrate complex
P  : product
I  : free inhibitor
EI : enzyme-inhibitor complex

The k-values are NOT chemicals in the tube.
They are rate constants describing how quickly each reaction step occurs.

This file uses illustrative classroom values, not experimentally measured
constants for a specific enzyme/drug.
"""

import numpy as np
import matplotlib.pyplot as plt
from scipy.integrate import solve_ivp


# ============================================================
# 1. RATE CONSTANTS
# ============================================================

k1 = 1.0       # E + S -> ES          substrate binding
k2 = 1.0       # ES -> E + S          substrate unbinding
k3 = 1.0       # ES -> E + P          catalysis / product formation

ki_on  = 1.0   # E + I -> EI          inhibitor binding
ki_off = 1.0   # EI -> E + I          inhibitor unbinding


# ============================================================
# 2. INITIAL CONDITIONS
# ============================================================

E0  = 1.0      # total enzyme initially free
S0  = 10.0     # substrate
ES0 = 0.0      # no substrate is bound at t = 0
P0  = 0.0      # no product at t = 0
EI0 = 0.0      # no inhibitor is bound at t = 0

# We will rerun the same experiment with different initial
# inhibitor amounts.
inhibitor_levels = [0.0, 0.5, 2.0, 10.0]

# Simulation window
t_eval = np.linspace(0, 30, 800)


# ============================================================
# 3. DIFFERENTIAL EQUATIONS
# ============================================================

def enzyme_system(t, y):
    """
    y contains the current state:
        y[0] = E
        y[1] = S
        y[2] = ES
        y[3] = P
        y[4] = I
        y[5] = EI
    """

    E, S, ES, P, I, EI = y

    # Reaction rates
    v1 = k1 * E * S       # E + S -> ES
    v2 = k2 * ES          # ES -> E + S
    v3 = k3 * ES          # ES -> E + P

    v4 = ki_on * E * I    # E + I -> EI
    v5 = ki_off * EI      # EI -> E + I

    # State equations
    dE  = -v1 + v2 + v3 - v4 + v5
    dS  = -v1 + v2
    dES =  v1 - v2 - v3
    dP  =  v3
    dI  = -v4 + v5
    dEI =  v4 - v5

    return [dE, dS, dES, dP, dI, dEI]


# ============================================================
# 4. RUN EACH EXPERIMENT
# ============================================================

results = {}

for I0 in inhibitor_levels:

    y0 = [E0, S0, ES0, P0, I0, EI0]

    solution = solve_ivp(
        enzyme_system,
        [t_eval[0], t_eval[-1]],
        y0,
        t_eval=t_eval,
        method="BDF",
        rtol=1e-8,
        atol=1e-10
    )

    results[I0] = solution.y


# ============================================================
# 5. PLOT PRODUCT FORMATION
# ============================================================

plt.figure(figsize=(8, 5))

for I0 in inhibitor_levels:
    P = results[I0][3]
    plt.plot(t_eval, P, label=f"I0 = {I0:g}")

plt.xlabel("Time")
plt.ylabel("Product P")
plt.title("Competitive inhibitor slows product formation")
plt.grid(True)
plt.legend()
plt.tight_layout()
plt.show()


# ============================================================
# 6. PLOT ENZYME PARTITION
# ============================================================
#
# Choose one inhibited experiment so we can see where the
# enzyme is physically "parked" over time.

I0 = 2.0

E  = results[I0][0]
ES = results[I0][2]
EI = results[I0][5]

plt.figure(figsize=(8, 5))
plt.plot(t_eval, E,  label="Free enzyme E")
plt.plot(t_eval, ES, label="Substrate-bound ES")
plt.plot(t_eval, EI, label="Inhibitor-bound EI")

plt.xlabel("Time")
plt.ylabel("Enzyme amount")
plt.title("Where the enzyme is: E + ES + EI = constant")
plt.grid(True)
plt.legend()
plt.tight_layout()
plt.show()


# ============================================================
# 7. PLOT THE REACTION RATES
# ============================================================
#
# These are the quantities that actually change with time.
# The k-values remain fixed; v1-v5 change because the species
# concentrations change.

I0 = 2.0

E, S, ES, P, I, EI = results[I0]

v1 = k1 * E * S
v2 = k2 * ES
v3 = k3 * ES
v4 = ki_on * E * I
v5 = ki_off * EI

plt.figure(figsize=(8, 5))
plt.plot(t_eval, v1, label="v1: substrate binding")
plt.plot(t_eval, v2, label="v2: substrate unbinding")
plt.plot(t_eval, v3, label="v3: product formation")
plt.plot(t_eval, v4, label="v4: inhibitor binding")
plt.plot(t_eval, v5, label="v5: inhibitor unbinding")

plt.xlabel("Time")
plt.ylabel("Reaction rate")
plt.title("Reaction rates for I0 = 2")
plt.grid(True)
plt.legend()
plt.tight_layout()
plt.show()


# ============================================================
# 8. CONSERVATION CHECKS
# ============================================================

total_enzyme = E + ES + EI
total_substrate_material = S + ES + P
total_inhibitor = I + EI

print("Conservation checks")
print("-------------------")
print("Total enzyme should stay near", E0)
print("Observed range:", total_enzyme.min(), "to", total_enzyme.max())

print()
print("Total substrate material should stay near", S0)
print("Observed range:", total_substrate_material.min(), "to",
      total_substrate_material.max())

print()
print("Total inhibitor should stay near", I0)
print("Observed range:", total_inhibitor.min(), "to",
      total_inhibitor.max())


# ============================================================
# 9. REDUCED MICHAELIS-MENTEN INTERPRETATION
# ============================================================
#
# For the uninhibited model:
#
# Vmax = k3 * E0
# Km   = (k2 + k3) / k1
#
# A competitive inhibitor leaves Vmax unchanged but raises
# the apparent Km.
#
# The full ODE model above shows WHY:
# inhibitor-bound enzyme EI is temporarily unavailable to
# form ES.

Vmax = k3 * E0
Km = (k2 + k3) / k1

print()
print("Uninhibited Michaelis-Menten parameters")
print("---------------------------------------")
print("Vmax =", Vmax)
print("Km   =", Km)
