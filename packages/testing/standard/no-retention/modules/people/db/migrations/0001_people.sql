create table people.badge (
  id uuid primary key,
  holder_name text not null
);

create table people.visit (
  id uuid primary key,
  person_id uuid not null,
  visitor_email text not null
);

create table people.member (
  id uuid primary key,
  person_id uuid not null,
  team text not null
);
