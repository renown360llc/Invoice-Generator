# Invoice Generator Pro

Professional, enterprise-grade invoice management system built with Vanilla JavaScript, HTML, and CSS, powered by **Supabase**.

## 🚀 Key Features

- **Dashboard**: High-level overview of billables, totals, and invoice statuses.
- **Invoice Management**: Create, edit, and track professional invoices.
- **Timesheet Tracking**: Log hours for consultants and automatically link them to invoices.
- **Consultant Management**: Maintain a central registry of vendors and consultants with bill rates.
- **Analytics**: Grouped summaries of revenue by consultant and currency.
- **PDF Export**: Generate high-fidelity PDF invoices ready for clients.
- **Audit Trails**: Detailed history of all data changes and system actions.
- **Branding**: Customizable templates with logo and business information.

## 🛠 Technology Stack

- **Frontend**: Vanilla JavaScript (ES Modules), HTML5, CSS3.
- **Build Tool**: [Vite](https://vitejs.dev/) for modern asset bundling and dev server.
- **Backend/DB**: [Supabase](https://supabase.com/) (PostgreSQL with RLS, Auth).
- **Hosting**: Configured for [Vercel](https://vercel.com/) via `vercel.json`.

## 📁 Project Structure

```text
├── src/
│   ├── modules/          # Core utility modules (UI, PDF, Audit, DB entities)
│   ├── components/       # Shared UI components (Layout, Menus)
│   ├── *-main.js         # Entry points for specific HTML pages
│   ├── database.js       # Base Supabase communication layer
│   ├── config.js         # Environment config and Auth state
│   └── auth.js           # Authentication guards and handlers
├── styles/               # Page-specific and global CSS modules
├── scripts/              # Utility scripts for data maintenance
├── public/               # Static assets
├── schema.sql            # Database schema and RLS policies
├── index.html            # Landing page
├── dashboard.html        # Main application dashboard
├── invoices.html         # Invoice management view
├── consultants.html      # Consultant registry
└── timesheets.html       # Billable hours tracking
```

## ⚙️ Setup & Installation

### Prerequisites
- Node.js (v18+)
- A Supabase account and project.

### 1. Clone & Install
```bash
npm install
```

### 2. Environment Variables
Create a `.env` file in the root directory:
```env
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

### 3. Database Setup
Run the contents of `schema.sql` in your Supabase SQL Editor to initialize the tables and Row Level Security (RLS) policies.

### 4. Run Locally
```bash
npm run dev
```

## 🔒 Security

This application uses **Supabase Row Level Security (RLS)**. All data is scoped to the `user_id` of the authenticated user.
- **Invoices**: Only accessible by the creator.
- **Consultants/Timesheets**: Scoped to the individual user.
- **Audit Events**: Automatically logged with the acting `user_id`.

## 📄 License
MIT
