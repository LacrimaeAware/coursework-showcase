# Selected calculations from Homework 1-2.
# The ISwR package supplies the public cystfibr teaching data.
library(ISwR)
data(cystfibr)

# Homework 1: select observations by row number.
cystfibr[c(5, 10, 15), , drop = FALSE]

# Homework 2: calculate numeric-column summaries.
numeric_data <- cystfibr[, sapply(cystfibr, is.numeric)]
num_vars <- ncol(numeric_data)
means <- numeric(num_vars)
sds <- numeric(num_vars)

for (index in 1:num_vars) {
  values <- numeric_data[, index]
  values <- values[!is.na(values)]
  n <- length(values)
  mean_value <- sum(values) / n
  sd_value <- sqrt(sum((values - mean_value)^2) / (n - 1))
  means[index] <- mean_value
  sds[index] <- sd_value
}

summary_matrix <- cbind(mean = means, sd = sds)
rownames(summary_matrix) <- colnames(numeric_data)
print(summary_matrix)

# Homework 2: compare group centers with within-group variation.
advertising <- c(5, 1, 11, 2, 8)
muzak <- c(0, 1, 4, 6, 3)
classical <- c(13, 9, 8, 15, 7)
mean_ad <- mean(advertising)
mean_mu <- mean(muzak)
mean_cl <- mean(classical)
overall <- mean(c(advertising, muzak, classical))
between_actual <- mean(c(
  (mean_ad - overall)^2,
  (mean_mu - overall)^2,
  (mean_cl - overall)^2
))
within_actual <- mean(c(var(advertising), var(muzak), var(classical)))
ratio_actual <- between_actual / within_actual
print(c(between = between_actual, within = within_actual, ratio = ratio_actual))
