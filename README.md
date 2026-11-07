# ZIMBA — Connected Real Estate Platform

A premium, mobile-first prototype for discovering and managing property in Uganda. The interface combines an editorial real-estate marketplace with a private-style management workspace.

## Live experience

GitHub Pages: https://mdanson27.github.io/THE-ZIMBA-RENT/

## Public experience

- Responsive homepage with property search
- Explore rentals, property sales, commercial spaces and land
- Search by area, property type, bedroom count and maximum price
- Property listing pages with image galleries, details, feature summaries and enquiry forms
- Saved properties persisted using browser storage
- Services, insights and illustrative construction cost estimator

## Workspace

Open **Management portal** in the top navigation.

- Overview: portfolio metrics and demo activity
- Properties: searchable portfolio and sample property creation
- Enquiries: submissions from demo listing pages
- Tenants & leases: future secure workflow outline
- Maintenance: create, inspect and advance demo work requests
- Finance: intentionally displays no invented financial metrics
- Export: property portfolio in CSV format

## Data and safety

**This is a frontend demonstration, not a production real-estate service.**

- All original sample listings, photos, prices, addresses and property details are **illustrative only**. They are not real, validated, available properties and must not be presented as such.
- Data created through demo forms lives in browser localStorage; it is not transmitted to an agent, email service or backend and does not sync between devices.
- Do not enter sensitive or real customer personal data in the demonstration.
- The budget estimator uses illustrative assumptions, not market-validated rates; no legal, financial or construction decision should rely on it.
- Authentication, roles, database, approval, storage, messaging, actual finance and payments are **not implemented**.
- Sample analytics visualizations are labelled as illustrative.

## Architecture

- index.html: application entry point
- assets/styles.css: responsive design system and layouts
- assets/app.js: client-side routing, demo data and interactive workflows
- .github/workflows/deploy.yml: GitHub Pages deployment

No build step required. Open index.html locally or publish the repository through GitHub Pages. Navigation uses hash-based routes to work under a project subpath.

## Planned production development

1. Validate information architecture and visual direction with the actual ZIMBA team.
2. Replace sample records with a validated property inventory and permissioned content management.
3. Implement a secure API, PostgreSQL, object storage, audit logs and staff/landlord/tenant access controls.
4. Build property, building, unit, tenant, lease, document, rent and maintenance data models.
5. Integrate enquiries, inspections, viewing scheduling and agent assignment.
6. Add professional valuation and building-budget services with qualified expert input.
7. Complete operational, accessibility, security, data protection and end-to-end testing.

The visual direction takes general inspiration from premium real-estate product design; it does not copy Knight Frank's copyrighted content or brand identity.
