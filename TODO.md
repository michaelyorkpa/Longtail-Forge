This is a place for me to jot down fixes and a "Wishlist" for things I'd like to do in the future. Organized by Short, Medium, and Long term.

# Short Term

## Fixes

- [x] Edit entries screen needs to have a duration editing box, not just a start & end time - Added in Version 0.22.5
- [ ] Edit entries screen currently displays full UUID when one is selected for editing; need a friendly name for that

## Tweaks

- [ ] Add table of contents to top of README.md

- [ ] Put astericks next to required fields in forms

- [ ] Add timezone to workspace and Client settings
- [ ] Add timezone to User settings
- [ ] Store all dates as UTC

- [ ] Add "display name" to User Settings, user admin, and user table
- [ ] Repurpose the existing user name field to be the user's email address
        - [ ] Add validation to ensure it's a valid email address (not sending emails yet)
        - [ ] Do not allow duplicate email addresses in the table (usernames)
        - [ ] Add [REDACTED] as the username for the current sadmin user
        - [ ] Replace front end references for "Username" to say "Email Address"
- [ ] Add field for back up email address (personal email address)
    - [ ] Allow login with backup email address
    - This ensures users can log back in and continue using personal tasks/accounts
    - The concept here, being, that even business users can leverage personal workspaces

## Workspace shift

Caveat: For self-hosted installs, create the ability to limit workspaces to business-only

- [ ] Rename Organization/organization everywhere to Workspace/workspace
    - [ ] Database references (all tables)
    - [ ] User Interface
    - [ ] Settings

- [ ] Create user_workspaces table to track what users have access to what workspaces
    - [ ] Disocciate users from being part of a specific workspace
    - [ ] Add user_owner_id (or something similar) to workspace table to identify the primary administrator of that workspace
        - This paves the way for re-assigning users as owners in business use cases

- [ ] Workspace type added to database
    - [ ] Business
        - Workspace name default to organization name
        - Full suite of project tools available
            - Tasks
            - Notes/KB
            - Time tracking
            - Clients/Projects
            - Billing/Invoicing/Reporting
            - Team Members
            - Permissions
    - [ ] Personal
        - Personal workspaces can be named anything, but default to "Personal"
        - What's available in Personal Workspaces:
            - Tasks
            - Notes/Knowledge Base
            - Time tracking (Optional)
            - Projects
            - Owner-only permissions (cannot add users to a personal workspace)
    - [ ] Family
        - Family workspaces can be named anyhting, but default to "Family"
        - What's available in Family Workspaces:
            - Tasks
            - Notes/KB
            - Time tracking (Optional)
            - Projects
            - Team members
            - Permissions (Family-focused, Child vs Adult accounts, number of users is limited)

- [ ] Update user admin screen
    - [ ] For the super administrator, creating new users should allow you to assign them to workspaces
    - [ ] For workspace administrators, creating new users should allow them to assign groups/teams roles and an advanced button with granular permissions

- [ ] Shift users away from being assigned a workspace_id
    - [ ] Users are now independent objects within the app
        - Users can have/use multiple workspaces
    - [ ] Clients should still have a workspace_id
    - [ ] Update sessions for users to have an active_workspace_id field
    - [ ] Add workspace swtiching funcitonality

- [ ] Shift projects away from being assigned a client_id
    - Projects must still have a workspace_id
    - Make client_id NULL
    - Update UI elements for Project settings
        - Convert settings screen to be a single list of all projects
        - Add "Filter by: Client" as a drop down above the single list of projects
        - Add "Filter by: Status" as a drop down next to the client drop down
        - Add field to optionally assign project to a client
    - Eventually, make a multi-select for projects where certain fields can be bulk edited

- [ ] Shift time etnries away from being assigned a client_id
    - Have client be an optional field on stop watches
    - Have project be a required field
    - 

- [ ] Add buttons on the User Settings screen to create new workspaces
    - [ ] For SaaS use, this will need to be grounded in "account type"
        - Personal users can only create a single personal workspace
        - Family users can create a single personal workspace and use the shared family workspace
        - Business users can create all of the above, plus Business Workspaces

## Tagging Foundation

- [ ] Replace “Add tags to time entries” with a shared tagging foundation
  - Tags should be workspace-scoped, using the current `organization_id` until the Workspace rename happens
  - Tags should not be stored as comma-separated text on records
  - Create a shared `tags` table for the tag definitions
  - Create a shared `tag_assignments` table for assigning tags to records
  - `tag_assignments` should support:
    - `organization_id` / future `workspace_id`
    - `tag_id`
    - `target_type`
    - `target_id`
    - `created_by_user_id`
    - `source` such as manual, system, import, rule
    - `created_at`
  - Supported initial `target_type` values:
    - `time_entry`
    - `client`
    - `project`
  - Future `target_type` values:
    - `task`
    - `note`
    - `support_ticket`
    - `invoice`

- [ ] Phase 1: Time entry tagging
  - Add tags to time entries first
  - Add tag picker/search UI to time tracker, manual time entry, and edit-entry screens
  - Add reporting filters by direct time-entry tags
  - Add basic tag management inside workspace settings or a simple admin page

- [ ] Phase 2: Client/project tagging
  - Allow clients and projects to be tagged as records
  - Show client/project tags as context on time entries
  - Do not automatically copy client/project tags onto time entries
  - Later reporting can optionally include records under clients/projects with matching tags

- [ ] Phase 3: Shared tagging service
  - Create shared tag repository/service methods
  - Validate that tagged records belong to the active workspace
  - Audit log tag create/update/delete and tag assignment changes
  - Keep tag logic reusable for future tasks, notes, tickets, and invoices

- [ ] Phase 4: System/automatic tags
  - Add optional system tags only after manual tagging works
  - Use real fields for behavior/security, then optionally expose them as system tags
  - Example: note visibility should be stored as `visibility`, not enforced by `#public`
  - System tags should be locked or protected from accidental deletion

## In-App Messaging

### Phase 1 - Automated messages

- [ ] Strictly for requests to join/invites to workspaces/clients/projects
- [ ] Create a dedicated "Messages" tab in menu
- [ ] This phase only needs the ability to send/receive requests/invites
    - [ ] This would leverage toast notifications

### Phase 2 - Assignation messages

- [ ] Notify users when they've been assigned a task/note/workspace

# Medium Term

- [ ] Start developing administration documentation

- [ ] Add geolocation settings

- [ ] Make UI "nicer" looking (also, fix the awful colors on the dark mode)

- [ ] Add toast and notification system
    - [ ] Warn about running timers (once DB timer persistence exists)
    - Eventually:
    - [ ] Task notifications
    - [ ] Task reminders
    - [ ] Future integrations (Slack, Discord, Teams, etc.)

## Team tools

- [ ] Create group/team permissions
    - Allow org, client, and project admins to create groups, assign permissions, and add/remove users
    - This will simplify administrative overhead of permission granting while adding users to clients/projects

- What other team tools would be beneficial?

## Module-ize the different components

- [ ] Make time-tracking/billing/invoicing its own module that can be installed independently during setup
- [ ] Make notes/knowledge base its own module
- [ ] Make support tickets its own module

## Automated checks for updates from GitHub Releases

- [ ] Make updating to newer versions as painless as possible for self-hosted users
- [ ] Create installation scripts for new releases that can be run from the front end (Kind of like WordPress)

# Long Term

## Leveraging other software/repositories

- At what point should I start building search for fast fulltext searches? 
    - Should I use elastic search or another technology? Is it best to just search the database with direct calls?
- At what point should I use caching technology, e.g. REDIS?
- At what point (if any) should I switch the front end to an existing JS framework?

## Tasks

### Phase 1 - Basic tasks

- [ ] Task title
- [ ] Task description
- [ ] Workspace link
- [ ] Optional client link
- [ ] Optional project link
- [ ] Creator user ID
- [ ] Status
    - open
    - in_progress
    - blocked
    - completed
    - archived
- [ ] Optional due date
- [ ] Optional due time
- [ ] Parent task ID
    - Giving the task a parent task ID gives the parent task a progress bar
    - Task progress bars can be turned off in the parent task's details or project/client/org-wide
    - Prevent loops by disallowing tasks to become a child of themselves or descendants
- [ ] Sort order
- [ ] Tags
- [ ] Basic recurrence fields
    - [ ] recurrence_enabled
    - [ ] recurrence_rule
    - [ ] recurrence_anchor_date
    - [ ] recurrence_next_due_at
    - [ ] recurrence_end_date
    - [ ] recurrence_task_template_id

### Phase 2 - Task Expansion

- [ ] Create join table for potential multiple person task assignment
- [ ] Add reminders (in addition to showing up on the app calendar/notifications)
- [ ] Recurrence task templates (separate table)
    - This will create a template of the original task, keeping the original task intact
    - Templates create a new standard task once a task is completed

## Knowledge Base/Notes

### Phase 1 - Basic Functionality

- [ ] Markdown body
- [ ] Title
- [ ] Org/Client/Project assignment
- [ ] Internal/public/client visibility field, even if public rendering does not exist yet
- [ ] Draft/published/archived status
- [ ] Basic editor
- [ ] Hideable Markdown cheat sheet
- [ ] Note list by workspace, Client, Project

### Phase 2 - Automatic internal knowledge base pages

Add auto-generated pages for:
- [ ] workspace Home
- [ ] Client home
- [ ] Project home
- [ ] Org-wide notes list
- [ ] Client notes list
- [ ] Project notes list

### Phase 3 - Manual knowledge base pages

Let users create manual pages and place them:
- [ ] Under workspace
- [ ] Under client
- [ ] Under project
- [ ] Under another manual page

Give them:
- [ ] Title
- [ ] Slug
- [ ] Markdown body
- [ ] Parent page
- [ ] Sort order
- [ ] Visibility
- [ ] Status

### Phase 4 - Wiki links and backlinks

Add:
- [ ] [[Page Title]]
- [ ] [[Page Title|label]]
- [ ] Broken-link detection
- [ ] Backlinks
- [ ] Maybe tags

### Phase 5 - Activity-aware home pages

Make org/client/project pages show:
- [ ] Latest notes
- [ ] Latest tasks
- [ ] Latest tickets
- [ ] Latest project changes
- [ ] To do list
- [ ] Open tickets

This should use a friendly activity feed, not raw audit JSON.

### Phase 6 - Public Knowledge Base

Add public routes like:
/kb/:workspaceSlug
/kb/:workspaceSlug/:pageSlug

Or, eventually, custom domains/subdomains.

Add:
- [ ] Public/private visibility checks
- [ ] Public page renderer
- [ ] SEO fields
- [ ] Search
- [ ] Sitemap
- [ ] Public-safe attachments

### Phase 7 - External publishing/plugins

Only after public API/auth/scopes are in good shape:
- [ ] WordPress KB plugin
- [ ] Shopify KB/product-support plugin
- [ ] Public API access
- [ ] Sync by API key
- [ ] Optional embeddable widgets

## Support Tickets

- [ ] Research what's really needed for support tickets

- [ ] Include some sort of CAPTCHA for public-facing forms

## Dashboard Tweaks

- [ ] Dashboard should become the hub
    - [ ] Dashboard is per user, displaying all of a user's workspaces, clients, and projects
    - [ ] Add "Past Due/Due Soon" section that shows past due and upcoming tasks sorted by Workspace, then client, then project
    - [ ] Add "Latest Updates" section which is organized by workspace, then newest clients, newest projects, newest tasks, newest notes, newest support tickets
    - Initial dashboard should be the user dashboard with Activity Feed/To Do/Tickets
        - Should also include Knowledge Base

## Integrations

- [ ] Create public-facing APIs with keys to allow the app to be integrated with existing solutions
- [ ] Google Calendar
    - For scheduling tasks
- [ ] Outlook Calendar
    - For scheduling tasks
- [ ] ZenDesk (?)
    - Definitely should have an import from ZenDesk
- [ ] Google Tasks
    - Need an import
    - Possible syncing??
- [ ] Micrsoft To Do
    - Need an import
    - Possible syncing??
- [ ] Microsoft SharePoint (?)
- [ ] WordPress/WooCommerce
    - [ ] Support Ticket plugin
        - Support tickets would need a form for the front end
    - [ ] Knowledge Base plugin
        - Product support and information
- [ ] Shopify
    - Same as WordPress
- [ ] Big Commerce
    - Same as WordPress
- [ ] Magento
    - Same as WordPress
- [ ] Slack
    - Task reminders
    - Support ticket Notifications
- [ ] Discord
    - Same as Slack
- [ ] Microsoft Teams
    - Same as Slack
- [ ] Quickbooks
    - For bringing in invoice details
- [ ] Other accounting software