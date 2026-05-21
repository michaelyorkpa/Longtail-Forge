# Longtail Forge
Plan the Project. Track the work. Preserve the knowledge.

## Background
Longtail Forge started off as a simple, flat file time tracker and has become a project hub for me.

## Phase One
- [x] One stop watch
- [x] Clients are saved in a custom, writeable YAML or JSON file
- [x] Each Client has Projects
- [x] These last two points are pulled into drop downs in stop watches
- [ ] ~Changing the client/project warns then resets the stop watch~
- [x] Each time a stop watch stops, a line is written to a CSV file for reporting
    - [x] Each line should include: 
        - [x] Current date
        - [x] Hours recorded by the stop watch
        - [x] Client
        - [x] Project
        - [x] Description
        - [ ] ~User (this can be hard coded in phase 1)~

## Phase Two
- [x] Multiple stop watches on screen (3)
    - [x] Each stop watch can be started, stopped, paused, and reset independently
    - [x] When one stop watch starts, the others stop automatically
    - [x] Each stop watch is assigned to a client and project and has a description field for the work being done
- [x] Reporting
- [x] Client/project editing on the front end
- [x] Time editing on the front end
- [x] Manual time entry
- [x] Home Screen
    - [x] Active Clients 
        - Shows total number with drop down to go to clients reporting
    - [x] Table with current month's billables
        - Only shows clients with billables for the month
    - [x] Bar graph showing previous 12 months' billables versus current month's billables
        - Left side is hours
        - Right side is dollars
        - Bottom is MM/YY with current month at far right, -12 months at far left

## Phase Three
- [ ] Migrate to SQLite database
- [ ] Break project and client UI apart
- [ ] Create nested clients
- [ ] Create nested projects
- [ ] Add users and full login with passwords
    - [ ] 
- [ ] Add roles
    - [ ] Super Admin
    - [ ] Organization Administrator
    - [ ] Client Administrator
    - [ ] Project Administrator
    - [ ] User
        - [ ] Add ability to assign each user to a specific client/project, with granular control
    - [ ] Client Users
        - This is for clients to collaborate with users within organizations
- [ ] Two Factor Authentication (TOTP)
- [ ] Passkeys
- [ ] SSO

## Road Map
- [ ] Add tasks
    - [ ] Tasks are assignable to Clients & Projects
    - [ ] Add personal task list functionality as unique client
    - [ ] Give tasks reminders, due dates, recurrence
    - [ ] Task assignment in multi-user organizations
- [ ] Notes
- [ ] Support Tickets
    - [ ] Integrated per client
- [ ] More Project Management