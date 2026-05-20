# Time Tracking and Reporting

## Phase One
- [x] One stop watch
- [x] Clients are saved in a custom, writeable YAML or JSON file
- [x] Each Client has Projects
- [x] These last two points are pulled into drop downs in stop watches
- [ ] ~Changing the client/project resets the stop watch~
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
- [ ] Home Screen
    - [ ] Active Clients 
        - Shows total number with drop down to go to clients reporting
    - [ ] Active Projects
        - Shows total number with drop down to go to projects reporting
    - [ ] Table with current month billables
    - [ ] Chart showing previous month versus current month billables

## Phase Three
- [ ] Add users and full login with passwords
- [ ] Add roles
    - [ ] Administrator
    - [ ] Client Administrator
    - [ ] Project Administrator
    - [ ] User
        - [ ] Add ability to assign each to a specific client/project
- [ ] Migrate to SQLite database
- [ ] Two Factor Authentication (TOTP)
- [ ] Passkeys
- [ ] SSO
