# Longtail Forge
Plan the Project. Track the work. Preserve the knowledge.

## Background
Longtail Forge started off as a simple, flat file time tracker and has become a project hub for me. I feel like it can be useful for others as well, so I'm building it out with more functionality.

The name is derived from the Wired article, and later book, *The Long Tail* by Chris Anderson. The concept is that the big, obvious stuff is only part of the story. In business, a few popular products or projects get most of the attention, but there's a "long tail" of smaller, niche, less obvious things that collectively matter a lot.

Freelancers and small agencies (web design & development, graphics design, etc.) tend to fill the gaps left behind by larger agencies/companies. The big project is easy. It has a start, an end, and a clearly visualized middle. The long tail of that is the stuff that comes after the launch:

- Small fixes
- Support requests
- Maintenance Notes
- Weird, client-specific settings
- Old decisions nobody remembers (don't turn off that box, it connects the database server to the file server)
- Recurring tasks
- Tiny updates that keep everything running

### Why I built this tool

I couldn't find a good, all-in-one tool that met my needs for time tracking, reporting, tasks, notes, and project management that integrated together in a way I found useful.

## Early Release 50,000-Foot Roadmap

### Phase 1 - Version 0.1
- [x] Single codebase
    - [x] Time tracking
    - [x] Clients
    - [x] Projects
- [x] SQLite
- [x] One default workspace
- [x] Users
- [ ] Roles

### Phase 2 - Version 0.2
- [ ] Add organiztion_id everywhere
- [ ] Add PostgreSQL support
- [ ] Add migrations
- [ ] Add backups/export/import
- [ ] Tasks
- [ ] Support Tickets
- [ ] Notes/Knowledge Base
- [ ] Calendars

### Phase 3 - Version 0.3
- [ ] Docker Compose
- [ ] Setup wizard
- [ ] Admin docs
- [ ] Self-hosted release
- [ ] Expand Project Management Tools

### Phase 4 - Version 0.4
- [ ] SaaS wrapper
- [ ] hosted PostgreSQL
- [ ] tenant signup
- [ ] billing
- [ ] email delivery
- [ ] monitoring

## Detailed Road Map

### Version 0.1
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

### Version 0.11
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
    - [x] Bar graph showing previous 12 months' hours and billables versus current month's hours and billables
        - Left side is total hours
        - Right side is dollars
        - Bottom is MM/YY with current month at far right, -12 months at far left

### Version 0.12
- [x] Migrate to SQLite database
- [x] Add users and full login with passwords
    - [x] Secure the app so that only the login page are accessible without login
    - [x] Create a splash page with link to login
- [x] Break project and client UI apart
- [x] Add billable flags to:
    - [x] Time tracker
    - [x] Client UI
    - [x] Project UI
    - [x] Have reporting respect billable flag
    - [x] Billable doesn't uncheck on the time tracker when a non-billable client/project is selected
- [x] Add a fourth timer
- [x] Dark mode
- [x] Add user admin screen for adding users
    - [x] Include buttons for Edit, Delete, Deactivate, Reactivate, and Reset Password
    - [x] Make the edit user modal real

### Version 0.20
- [x] Refactor server.js
    - [x] Use src/app.js style structure as in
        - src/
            - app.js
            - config.js
            - routes/
                - auth.routes.js
                - clients.routes.js
                - projects.routes.js
                - time-entries.routes.js
                - settings.routes.js
            - middleware/
                - require-auth.js
                - require-role.js
            - services/
                - auth.service.js
                - billing.service.js
                - reporting.service.js
            - repositories/
                - users.repo.js
                - clients.repo.js
                - projects.repo.js
                - time-entries.repo.js
            - db/
                - index.js
                - migrations/
                    - 001_initial_schema.sql
                    - 002_add_tasks.sql
                    - etc.
- [x] Incorporate Express or Fastify
- [x] Move browser JavaScript and styles into public assets

### Version 0.30
- [ ] Add roles
    - [ ] Super Admin 
        - Controls all organizations within the app; Can also edit clients, projects, and users in each organization
        - Super admins have full access to assign anyone to anything, but cannot break the limits set below
    - [ ] Organization Administrator 
        - Controls all clients, projects, and users within the organization
        - Cannot see any clients/projects that belong to other organizations
    - [ ] Client Administrator 
        - Controls all client details and projects and users for a specific client
    - [ ] Project Administrator 
        - Controls all projects and project details for a specific client, can assign users to projects within client
    - [ ] Client User 
        - Can contribute time to any projects within a client 
    - [ ] Project User 
        - Can contribute time to a specific project
    - [ ] Assign users to roles and specific clients/projects from within the edit user modal window
    - [ ] Add granular CRUD control once a user is assigned to a client or project
        - [ ] Client admins can be restricted from editing billing details by the org admin
        - [ ] Project admins can be restricted from editing billing details by the client/org admins
        - [ ] Also add ability to control access to manual time entry and edit time entries
        - [ ] For client user and project user roles, they can only access their own times
- [ ] Create nested clients
- [ ] Create nested projects

### Version 0.40
- [ ] Tasks
- [ ] Support Tickets
- [ ] Expand Reporting
- [ ] Invoicing
- [ ] Two Factor Authentication (TOTP)
- [ ] Passkeys
- [ ] SSO

### Version 0.50
- [ ] Client Users
    - This is for clients to collaborate with users within organizations

## License

Longtail Forge is licensed under the GNU Affero General Public License v3.0 or later.

You may use, study, modify, and self-host Longtail Forge under the terms of the AGPL. If you modify Longtail Forge and make it available to users over a network, you must make the corresponding source code for your modified version available under the AGPL.

Commercial licensing may be available separately.

## Trademark

“Longtail Forge” and the Longtail Forge logo are trademarks of Michael York DBA Raymond Tec. You may use the name to refer to the original project, but you may not use the name, logo, or confusingly similar branding for a competing hosted service or modified distribution without permission.
