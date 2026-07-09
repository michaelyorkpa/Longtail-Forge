# Plugin SDK and Integration Example License Policy

## Purpose

Longtail Forge may eventually expose plugin APIs, integration examples, SDKs, starter templates, and compatibility examples.

The goal is to make third-party integration practical without weakening the AGPL public core or accidentally giving away proprietary hosted-service code.

## Default Rule

The public Longtail Forge core remains AGPL-3.0-only.

Plugin SDKs, starter templates, and integration examples are licensed under Apache-2.0 **only when expressly marked** by file header, directory-level notice, package metadata, or README.

Recommended identifier:

```text
SPDX-License-Identifier: Apache-2.0
```

Official license reference:

```text
https://www.apache.org/licenses/LICENSE-2.0
```

## What May Be Apache-2.0

The Project Owner may license the following under Apache-2.0:

- plugin SDK packages;
- client libraries for public APIs;
- integration starter templates;
- minimal example plugins;
- sample import/export connectors;
- test fixtures for SDK consumers;
- documentation examples that are intended to be copied into third-party plugins.

## What Should Stay AGPL-3.0-only

The following should stay AGPL-3.0-only unless a deliberate exception is made:

- core framework code;
- app runtime code;
- first-party public modules;
- database adapters;
- migrations;
- UI framework components used by the core app;
- permission and workspace systems;
- internal event bus implementation;
- core search, files, help, reminders, notifications, and module registration code;
- anything copied from or tightly coupled to the public core.

## What May Stay Proprietary

The following may remain proprietary / all rights reserved:

- official hosted-service plugin marketplace code;
- private billing integrations;
- paid first-party plugins;
- managed-hosting automation;
- private deployment code;
- private support/admin tooling;
- private SaaS-only modules;
- customer-specific integrations;
- commercial connector packs.

## Third-Party Plugins

A third-party plugin that uses only a stable public plugin API, does not copy AGPL-covered Longtail Forge code, and runs as a separable work may be distributed under the third party's chosen license.

However, this policy does not guarantee that every plugin is legally separate from the AGPL-covered core in every jurisdiction or architecture. A plugin that copies, modifies, links deeply with, or derives from AGPL-covered code may trigger AGPL obligations.

When in doubt, plugin authors should consult counsel.

## Directory Notices

A directory intended to be Apache-2.0 should include a README or license notice such as:

```text
Files in this directory are licensed under the Apache License 2.0 unless a specific file says otherwise.
SPDX-License-Identifier: Apache-2.0
```

Do not rely on assumptions. Mark SDK/example directories clearly.
