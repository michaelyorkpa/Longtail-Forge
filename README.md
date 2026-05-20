# Time Tracking and Reporting

## Phase One
- One stop watch
- Clients are saved in a custom, writeable YAML or JSON file
- Each Client has Projects
- These last two points are pulled into drop downs in stop watches
- Changing the client/project resets the stop watch
- Each time a stop watch stops, a line is written to a CSV file for reporting
    - Each line should include: 
        - Current date
        - Hours recorded by the stop watch
        - Client
        - Project
        - Description
        - User (this can be hard coded in phase 1)

## Phase Two
- Multiple stop watches on screen (2? 3? 4?)
    - Each stop watch can be started, stopped, and reset independently
    - When one stop watch starts, the others stop automatically
    - Each stop watch is assigned to a client and project and has a description field for the work being done
- Reporting
- Client/project editing on the front end