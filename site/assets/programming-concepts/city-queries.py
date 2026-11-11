# 07/20/2025
# COP2510 - Programming Concepts
# Chapter 14 Assignment 1
# Database Manipulation

import sqlite3

def main():
    choice = 0
    conn = sqlite3.connect('../cities.db')
    cur = conn.cursor()

    while choice != 8:
        choice = get_choice()
        run_task(choice, cur)

    conn.close()

def show_menu():
    print("1 - Display a list of cities sorted by population, in ascending order.")
    print("2 - Display a list of cities sorted by population, in descending order.")
    print("3 - Display a list of cities sorted by name.")
    print("4 - Display the total population of all the cities.")
    print("5 - Display the average population of all the cities.")
    print("6 - Display the city with the highest population.")
    print("7 - Display the city with the lowest population.")
    print("8 - EXIT")

def get_choice():
    show_menu()
    try:
        choice = int(input("Enter your choice: "))
        while choice < 1 or choice > 8:
            choice = int(input("Enter a valid choice (1–8): "))
        return choice
    except ValueError:
        print("That wasn't a number.")
        return 0

def run_task(choice, cur):
    if choice == 1:
        show_by_population_asc(cur)
    elif choice == 2:
        show_by_population_desc(cur)
    elif choice == 3:
        show_by_name(cur)
    elif choice == 4:
        show_total(cur)
    elif choice == 5:
        show_average(cur)
    elif choice == 6:
        show_highest(cur)
    elif choice == 7:
        show_lowest(cur)

def show_by_population_asc(cur):
    cur.execute("SELECT CityName, Population FROM Cities ORDER BY Population")
    cities = cur.fetchall()
    print("Display a list of cities sorted by population, in ascending order.")
    display_table(cities)

def show_by_population_desc(cur):
    cur.execute("SELECT CityName, Population FROM Cities ORDER BY Population DESC")
    cities = cur.fetchall()
    print("Display a list of cities sorted by population, in descending order.")
    display_table(cities)

def show_by_name(cur):
    cur.execute("SELECT CityName, Population FROM Cities ORDER BY CityName")
    cities = cur.fetchall()
    print("Display a list of cities sorted by name.")
    display_table(cities)

def show_total(cur):
    cur.execute("SELECT SUM(Population) FROM Cities")
    total = cur.fetchone()[0]
    print(f"Display the total population of all the cities: {total:,.0f}")

def show_average(cur):
    cur.execute("SELECT AVG(Population) FROM Cities")
    avg = cur.fetchone()[0]
    print(f"Display the average population of all the cities: {avg:,.0f}")

def show_highest(cur):
    cur.execute("SELECT MAX(Population) FROM Cities")
    max_val = cur.fetchone()[0]
    cur.execute("SELECT CityName, Population FROM Cities WHERE Population = ?", (max_val,))
    city = cur.fetchone()
    print(f"Display the city with the highest population: {city[0]} ({city[1]:,.0f})")

def show_lowest(cur):
    cur.execute("SELECT MIN(Population) FROM Cities")
    min_val = cur.fetchone()[0]
    cur.execute("SELECT CityName, Population FROM Cities WHERE Population = ?", (min_val,))
    city = cur.fetchone()
    print(f"Display the city with the lowest population: {city[0]} ({city[1]:,.0f})")

def display_table(cities):
    print(f"{'City':20}Population")
    for name, pop in cities:
        print(f"{name:20}{pop:,.0f}")

if __name__ == '__main__':
    main()