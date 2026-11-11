# Calculate monthly and annual automobile expenses

def calcExpenses(loan, insurance, gas, oil, tires, maintenance):
    # Returns total monthly expenses
    return loan + insurance + gas + oil + tires + maintenance

def main():
    print("Please enter your individual MONTHLY expenses.")

    loan = float(input("Loan payment: "))
    insurance = float(input("Insurance payment: "))
    gas = float(input("Gas cost: "))
    oil = float(input("Oil cost: "))
    tires = float(input("Tire cost: "))
    maintenance = float(input("Maintenance cost: "))

    total_monthly = calcExpenses(loan, insurance, gas, oil, tires, maintenance)
    total_annual = total_monthly * 12

    print("\nTotal monthly expense: $", round(total_monthly, 2))
    print("Total annual expense: $", round(total_annual, 2))

main()
