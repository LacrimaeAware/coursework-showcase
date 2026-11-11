%% Michaelis-Menten Enzyme Model
%
% Reaction:
%
%             k1
%       E + S ---> ES
%             <---
%              k2
%
%       ES  --->  E + P
%              k3
%
% E  = free enzyme
% S  = free substrate
% ES = enzyme-substrate complex
% P  = product
%
% k1 = binding rate constant
% k2 = unbinding rate constant
% k3 = catalytic/product-formation rate constant
%
%
% IMPORTANT:
%
% k1, k2, and k3 are PARAMETERS.
% They stay constant during one simulation.
%
% The actual reaction rates
%
%   v1 = k1*E*S
%   v2 = k2*ES
%   v3 = k3*ES
%
% change over time because E, S, and ES change.


%% ============================================================
% CLEAN MATLAB WORKSPACE
% =============================================================

clear;
clc;

% We intentionally do NOT use "close all".
% That way old figure windows do not instantly disappear.


%% ============================================================
% INITIAL CONDITIONS
% =============================================================
%
% These are what is present in the test tube at t = 0.

E0  = 1;       % Initial free enzyme
S0  = 100;     % Initial free substrate
ES0 = 0;       % Initially no bound enzyme-substrate complex
P0  = 0;       % Initially no product


% ode15s wants the initial values in one COLUMN vector.
%
% y(1) = E
% y(2) = S
% y(3) = ES
% y(4) = P

y0 = [E0;
      S0;
      ES0;
      P0];


%% ============================================================
% RATE CONSTANTS
% =============================================================
%
% These are NOT chemicals.
%
% They describe how quickly each reaction process occurs.
%
% These values are illustrative classroom values.
% Real values would normally be determined experimentally.

params.k1 = 1;     % E + S -> ES
params.k2 = 1;     % ES -> E + S
params.k3 = 1;     % ES -> E + P


%% ============================================================
% SIMULATION TIME
% =============================================================

tspan = [0 140];


%% ============================================================
% SOLVE THE ODE SYSTEM
% =============================================================
%
% ode15s repeatedly asks:
%
% "Given the current E, S, ES, and P,
%  how quickly is each variable changing?"
%
% Chemical reaction models can have very fast and very slow
% processes at the same time, so ode15s is useful here.

[t, y] = ode15s( ...
    @(t,y) MMEqn(t, y, params), ...
    tspan, ...
    y0);


%% ============================================================
% EXTRACT THE SOLUTIONS
% =============================================================
%
% Each column of y corresponds to one model variable.

E  = y(:,1);
S  = y(:,2);
ES = y(:,3);
P  = y(:,4);


%% ============================================================
% CALCULATE REACTION RATES AT EVERY SAVED TIME
% =============================================================
%
% IMPORTANT MATLAB DETAIL:
%
% v1, v2, and v3 are also calculated inside MMEqn,
% but variables created inside that function are LOCAL.
%
% The plotting section cannot see those local variables.
%
% Therefore we calculate the rates again here.
%
% E, S, and ES here are entire vectors, so we use .*
% for element-by-element multiplication.


% Binding:
%
% E + S -> ES

v1 = params.k1 .* E .* S;


% Unbinding:
%
% ES -> E + S

v2 = params.k2 .* ES;


% Catalysis / product formation:
%
% ES -> E + P

v3 = params.k3 .* ES;


% Net change in the enzyme-substrate complex:
%
% dES/dt > 0  -> ES is increasing
%
% dES/dt = 0  -> ES is approximately steady
%
% dES/dt < 0  -> ES is decreasing

dES = v1 - v2 - v3;


%% ============================================================
% CONSERVATION CHECKS
% =============================================================


% Enzyme is never destroyed.
%
% It is either:
%
%   free E
%
% or
%
%   bound inside ES
%
% Therefore:
%
% E + ES = E0

totalEnzyme = E + ES;


% Original substrate material is either:
%
%   free S
%
%   bound inside ES
%
%   converted into P
%
% Therefore:
%
% S + ES + P = S0

totalMaterial = S + ES + P;


%% ============================================================
% MICHAELIS-MENTEN PARAMETERS
% =============================================================

Vmax = params.k3 * E0;

Km = (params.k2 + params.k3) / params.k1;


fprintf('\n');
fprintf('Michaelis-Menten parameters\n');
fprintf('----------------------------\n');
fprintf('Vmax = %.4f\n', Vmax);
fprintf('Km   = %.4f\n', Km);

fprintf('\n');
fprintf('Initial reaction rates\n');
fprintf('----------------------\n');
fprintf('v1(0) = %.4f   binding\n', v1(1));
fprintf('v2(0) = %.4f   unbinding\n', v2(1));
fprintf('v3(0) = %.4f   product formation\n', v3(1));

fprintf('\n');


%% ============================================================
% FIGURE 1
% SPECIES DYNAMICS
% =============================================================
%
% E and ES live on a scale of approximately 0 to 1.
%
% S and P live on a scale of approximately 0 to 100.
%
% Therefore we DO NOT put all four on the same y-axis.


figure( ...
    'Name', 'Species Dynamics', ...
    'WindowStyle', 'normal');


tiledlayout(2,1, ...
    'TileSpacing', 'compact', ...
    'Padding', 'compact');



%% ------------------------------------------------------------
% Free enzyme vs bound enzyme
% -------------------------------------------------------------

nexttile

plot(t, E, ...
    'LineWidth', 2)

hold on

plot(t, ES, ...
    'LineWidth', 2)

hold off

grid on

xlabel('Time')
ylabel('Enzyme amount / concentration')

title('Free Enzyme E vs Bound Complex ES')

legend( ...
    'Free enzyme E', ...
    'Bound complex ES', ...
    'Location', 'best')

ylim([0 E0*1.05])



%% ------------------------------------------------------------
% Substrate vs product
% -------------------------------------------------------------

nexttile

plot(t, S, ...
    'LineWidth', 2)

hold on

plot(t, P, ...
    'LineWidth', 2)

hold off

grid on

xlabel('Time')
ylabel('Amount / concentration')

title('Substrate Converted Into Product')

legend( ...
    'Free substrate S', ...
    'Product P', ...
    'Location', 'best')

ylim([0 S0*1.05])


sgtitle('Michaelis-Menten Species Dynamics')



%% ============================================================
% FIGURE 2
% REACTION RATES -- INITIAL TRANSIENT
% =============================================================
%
% At t = 0:
%
% E  = 1
% S  = 100
% ES = 0
%
% Therefore:
%
% v1 = k1*E*S = 1*1*100 = 100
%
% while:
%
% v2 = 0
% v3 = 0
%
% This creates a VERY FAST initial binding transient.


figure( ...
    'Name', 'Initial Reaction Rates', ...
    'WindowStyle', 'normal');


plot(t, v1, ...
    'LineWidth', 2)

hold on

plot(t, v2, ...
    'LineWidth', 2)

plot(t, v3, ...
    'LineWidth', 2)

hold off

grid on

xlabel('Time')
ylabel('Reaction rate')

title('Initial Fast Binding Transient')

legend( ...
    'v1 = k1 E S   binding', ...
    'v2 = k2 ES    unbinding', ...
    'v3 = k3 ES    product formation', ...
    'Location', 'best')


% Zoom into the very beginning.
%
% Change this value if you want an even closer view.

xlim([0 1])



%% ============================================================
% FIGURE 3
% REACTION RATES -- LONG-TERM VIEW
% =============================================================
%
% The first v1 value is approximately 100.
%
% Shortly afterward the important reaction rates are closer
% to roughly 0-2.
%
% If MATLAB scales everything from 0 to 100, the long-term
% behavior looks like a flat line.
%
% Here we deliberately clip the initial spike so that we can
% see what happens during most of the reaction.


figure( ...
    'Name', 'Long-Term Reaction Rates', ...
    'WindowStyle', 'normal');


plot(t, v1, ...
    'LineWidth', 2)

hold on

plot(t, v2, ...
    'LineWidth', 2)

plot(t, v3, ...
    'LineWidth', 2)

hold off

grid on

xlabel('Time')
ylabel('Reaction rate')

title('Reaction Rates After Initial Binding Burst')

legend( ...
    'v1 = binding', ...
    'v2 = unbinding', ...
    'v3 = product formation', ...
    'Location', 'best')


% Deliberately zoom the y-axis.
%
% The giant initial v1 spike will be clipped.
%
% That is intentional.

ylim([0 2.5])



%% ============================================================
% FIGURE 4
% WHY ES RISES AND FALLS
% =============================================================
%
% This is one of the most useful graphs conceptually.
%
% Remember:
%
% dES/dt = v1 - v2 - v3
%
%
% If:
%
% v1 > v2 + v3
%
% then ES increases.
%
%
% If:
%
% v1 = v2 + v3
%
% then ES is approximately steady.
%
%
% If:
%
% v1 < v2 + v3
%
% then ES decreases.


figure( ...
    'Name', 'Net Change in ES', ...
    'WindowStyle', 'normal');


plot(t, dES, ...
    'LineWidth', 2)

hold on

yline(0, '--')

hold off

grid on

xlabel('Time')
ylabel('dES/dt')

title('Why ES Rises or Falls: dES/dt = v1 - v2 - v3')


% Again, clip the extreme initial value so that the slower
% dynamics remain visible.

ylim([-1 1])



%% ============================================================
% FIGURE 5
% CONSERVATION CHECK
% =============================================================

figure( ...
    'Name', 'Conservation Check', ...
    'WindowStyle', 'normal');


tiledlayout(2,1, ...
    'TileSpacing', 'compact', ...
    'Padding', 'compact');



%% ------------------------------------------------------------
% Total enzyme
% -------------------------------------------------------------

nexttile

plot(t, totalEnzyme, ...
    'LineWidth', 2)

grid on

xlabel('Time')
ylabel('E + ES')

title('Total Enzyme Should Remain Constant')

ylim([0 E0*1.1])



%% ------------------------------------------------------------
% Total substrate material
% -------------------------------------------------------------

nexttile

plot(t, totalMaterial, ...
    'LineWidth', 2)

grid on

xlabel('Time')
ylabel('S + ES + P')

title('Total Substrate Material Should Remain Constant')

ylim([0 S0*1.1])


sgtitle('Conservation Checks')



%% ============================================================
% OPTIONAL:
% COMPARE DIFFERENT k1 VALUES
% =============================================================
%
% k1 controls how quickly free enzyme and free substrate bind.
%
% Each k1 value below represents a DIFFERENT hypothetical
% chemical system / experimental condition.
%
% k2 and k3 remain fixed.


k1_values = [0.01 0.1 1 10];


figure( ...
    'Name', 'Effect of Changing k1', ...
    'WindowStyle', 'normal');


tiledlayout(2,2, ...
    'TileSpacing', 'compact', ...
    'Padding', 'compact');


ax1 = nexttile;
hold(ax1, 'on');

ax2 = nexttile;
hold(ax2, 'on');

ax3 = nexttile;
hold(ax3, 'on');

ax4 = nexttile;
hold(ax4, 'on');



%% Run one experiment for each k1 value

for n = 1:length(k1_values)

    % Change only k1.

    testParams = params;

    testParams.k1 = k1_values(n);


    % Solve model.

    [tk, yk] = ode15s( ...
        @(t,y) MMEqn(t, y, testParams), ...
        tspan, ...
        y0);


    % Extract variables.

    Ek  = yk(:,1);
    Sk  = yk(:,2);
    ESk = yk(:,3);
    Pk  = yk(:,4);


    % Calculate the binding reaction rate.

    v1k = testParams.k1 .* Ek .* Sk;


    % Label used in legends.

    label = sprintf('k1 = %.2f', k1_values(n));


    %% Plot ES

    plot(ax1, ...
        tk, ESk, ...
        'LineWidth', 2, ...
        'DisplayName', label);


    %% Plot free enzyme

    plot(ax2, ...
        tk, Ek, ...
        'LineWidth', 2, ...
        'DisplayName', label);


    %% Plot product

    plot(ax3, ...
        tk, Pk, ...
        'LineWidth', 2, ...
        'DisplayName', label);


    %% Plot binding rate

    plot(ax4, ...
        tk, v1k, ...
        'LineWidth', 2, ...
        'DisplayName', label);

end



%% ------------------------------------------------------------
% Format k1 comparison plots
% -------------------------------------------------------------


grid(ax1, 'on')
xlabel(ax1, 'Time')
ylabel(ax1, 'ES')
title(ax1, 'Bound Complex ES')
legend(ax1, 'Location', 'best')



grid(ax2, 'on')
xlabel(ax2, 'Time')
ylabel(ax2, 'E')
title(ax2, 'Free Enzyme E')
legend(ax2, 'Location', 'best')



grid(ax3, 'on')
xlabel(ax3, 'Time')
ylabel(ax3, 'P')
title(ax3, 'Product Formation')
legend(ax3, 'Location', 'best')



grid(ax4, 'on')
xlabel(ax4, 'Time')
ylabel(ax4, 'v1')
title(ax4, 'Binding Rate v1 = k1 E S')
legend(ax4, 'Location', 'best')


% The initial rate can be enormous for large k1 values.
%
% Clip the y-axis so we can see the slower behavior.
%
% Comment this line out if you want MATLAB to show the
% entire initial spike.

ylim(ax4, [0 5])


sgtitle('Effect of Changing the Binding Constant k1')



%% ============================================================
% ODE FUNCTION
% =============================================================
%
% MATLAB repeatedly calls this function during ode15s.
%
% At each instant MATLAB supplies:
%
% t = current time
%
% y = current values of:
%
%     E
%     S
%     ES
%     P
%
%
% The function returns:
%
% dydt = the current rates of change.


function dydt = MMEqn(~, y, params)


    %% --------------------------------------------------------
    % CURRENT STATE
    % ---------------------------------------------------------

    E  = y(1);      % Free enzyme
    S  = y(2);      % Free substrate
    ES = y(3);      % Bound enzyme-substrate complex
    P  = y(4);      %#ok<NASGU>
                    % Product is tracked,
                    % but P does not affect these rates.


    %% --------------------------------------------------------
    % RATE CONSTANTS
    % ---------------------------------------------------------

    k1 = params.k1;
    k2 = params.k2;
    k3 = params.k3;


    %% --------------------------------------------------------
    % REACTION RATES
    % ---------------------------------------------------------


    % Reaction 1:
    %
    % E + S -> ES
    %
    % Free enzyme binds free substrate.

    v1 = k1 * E * S;


    % Reaction 2:
    %
    % ES -> E + S
    %
    % Bound substrate simply unbinds.

    v2 = k2 * ES;


    % Reaction 3:
    %
    % ES -> E + P
    %
    % Bound substrate is chemically converted into product.

    v3 = k3 * ES;



    %% --------------------------------------------------------
    % DIFFERENTIAL EQUATIONS
    % ---------------------------------------------------------


    % Free enzyme:
    %
    % loses E through binding
    %
    % gains E through unbinding
    %
    % gains E again after catalysis

    dE = -v1 + v2 + v3;



    % Free substrate:
    %
    % loses S through binding
    %
    % gains S again through unbinding

    dS = -v1 + v2;



    % Bound enzyme-substrate complex:
    %
    % gains ES through binding
    %
    % loses ES through unbinding
    %
    % loses ES through catalysis

    dES = v1 - v2 - v3;



    % Product:
    %
    % created only by catalysis

    dP = v3;



    %% --------------------------------------------------------
    % RETURN DERIVATIVES TO ode15s
    % ---------------------------------------------------------

    dydt = [dE;
            dS;
            dES;
            dP];

end