# Selected calculations from Homework 4-5.
# Run with Advertising.csv in the working directory.
advertising <- read.csv("Advertising.csv")
model_radio <- lm(sales ~ radio, data = advertising)
print(summary(model_radio))
print(coef(model_radio))
print(confint(model_radio, level = 0.95))
print(confint(model_radio, level = 0.99))
print(predict(model_radio, newdata = data.frame(radio = 50)))

coef_vals <- coef(summary(model_radio))
slope_est <- coef_vals[2, 1]
slope_se <- coef_vals[2, 2]
slope_CI <- c(slope_est - 2 * slope_se, slope_est + 2 * slope_se)
print(slope_CI)

plot(advertising$radio, advertising$sales,
     xlab = "Radio Advertising (thousands of dollars)",
     ylab = "Sales (thousands of units)",
     main = "Sales vs Radio Advertising")
abline(model_radio, col = "blue", lwd = 2)
