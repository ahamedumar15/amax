-- 055: the IT Admin role (ITAdmin), assignable by group mapping, by hand, and previewed through View as.
alter table auth.role_mapping drop constraint role_mapping_role_check,
  add constraint role_mapping_role_check check (role in ('Admin', 'ITAdmin', 'Leadership', 'PM', 'Engineer', 'Finance', 'Sales', 'HR', 'Payroll', 'Employee'));
alter table auth.role_assignment drop constraint role_assignment_role_check,
  add constraint role_assignment_role_check check (role in ('Admin', 'ITAdmin', 'Leadership', 'PM', 'Engineer', 'Finance', 'Sales', 'HR', 'Payroll', 'Employee'));
alter table auth.session drop constraint session_view_as_role_check,
  add constraint session_view_as_role_check check (view_as_role in ('Admin', 'ITAdmin', 'Leadership', 'PM', 'Engineer', 'Finance', 'Sales', 'HR', 'Payroll', 'Employee'));
