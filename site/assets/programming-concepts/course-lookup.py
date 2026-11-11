# 06/22/2025
# COP2510 - Programming Concepts
# Chapter 9 Assignment 1
# Course Info Lookup

# get course from user
def get_course():
    return input("Enter course number: ").upper()

# print info for course
def course_info(course):
    rooms = {'CS101': 3004, 'CS102': 4501, 'CS103': 6755, 'NT110': 1244, 'CM241': 1411}
    profs = {'CS101': 'Haynes', 'CS102': 'Alvarado', 'CS103': 'Rich', 'NT110': 'Burke', 'CM241': 'Lee'}
    times = {'CS101': '8:00 am', 'CS102': '9:00 am', 'CS103': '10:00 am', 'NT110': '11:00 am', 'CM241': '1:00 pm'}

    if course in rooms:
        print(f"room: {rooms[course]}")
        print(f"teacher: {profs[course]}")
        print(f"time: {times[course]}")
    else:
        print("Incorrect course number.")

# main thing
def main():
    course = get_course()
    course_info(course)

if __name__ == "__main__":
    main()
