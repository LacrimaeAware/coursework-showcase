# 07/06/2025
# COP2510 - Programming Concepts
# Chapter 11 Assignment 1
# Employee Data

class Employee:
    def __init__(self, name="", number=""):
        self.name = name
        self.number = number

    def set_name(self, name):
        self.name = name

    def set_number(self, number):
        self.number = number

    def get_name(self):
        return self.name

    def get_number(self):
        return self.number

class ProductionWorker(Employee):
    def __init__(self, name="", number="", shift=1, pay_rate=0.0):
        super().__init__(name, number)
        self.shift = shift
        self.pay_rate = pay_rate

    def set_shift(self, shift):
        self.shift = shift

    def set_pay_rate(self, pay_rate):
        self.pay_rate = pay_rate

    def get_shift(self):
        return self.shift

    def get_pay_rate(self):
        return self.pay_rate

def main():
    name = input("employee name: ")
    num = input("employee number: ")
    shift = int(input("shift (1 or 2): "))
    rate = float(input("hourly pay: "))

    w = ProductionWorker(name, num, shift, rate)

    print("")
    print("--- EMPLOYEE INFO ---")
    print("NAME:", w.get_name())
    print("NUMBER:", w.get_number())
    print("SHIFT:", w.shift)
    print("PAY RATE: $" + str(w.get_pay_rate()))

if __name__ == '__main__':
    main()
