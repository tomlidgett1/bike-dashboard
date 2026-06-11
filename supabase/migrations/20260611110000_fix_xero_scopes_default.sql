ALTER TABLE xero_connections
  ALTER COLUMN scopes SET DEFAULT ARRAY[
    'openid', 'profile', 'email', 'offline_access',
    'app.connections',
    'accounting.settings.read', 'accounting.contacts.read',
    'accounting.attachments.read', 'accounting.budgets.read',
    'accounting.payments.read', 'accounting.invoices.read',
    'accounting.banktransactions.read', 'accounting.manualjournals.read',
    'accounting.reports.aged.read', 'accounting.reports.balancesheet.read',
    'accounting.reports.banksummary.read', 'accounting.reports.budgetsummary.read',
    'accounting.reports.executivesummary.read', 'accounting.reports.profitandloss.read',
    'accounting.reports.trialbalance.read', 'accounting.reports.taxreports.read',
    'accounting.reports.tenninetynine.read',
    'assets.read', 'files.read', 'projects.read',
    'payroll.employees.read', 'payroll.payruns.read', 'payroll.payslip.read',
    'payroll.settings.read', 'payroll.timesheets.read'
  ];
