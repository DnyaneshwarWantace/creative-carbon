import { Migration } from '@mikro-orm/migrations';

export class Migration20261007164542_cc_production extends Migration {

  override up(): void | Promise<void> {
    this.addSql(`create table "cc_dryers" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "is_active" boolean not null default true, "updated_by_name" text null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "deleted_at" timestamptz null, "code" text not null, "kind" text not null, "notes" text null, primary key ("id"));`);
    this.addSql(`create index "cc_dryers_scope_idx" on "cc_dryers" ("organization_id", "tenant_id");`);

    this.addSql(`create table "cc_loading_tolerances" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "is_active" boolean not null default true, "updated_by_name" text null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "deleted_at" timestamptz null, "thickness_mm" numeric(6,2) not null, "min_kg" numeric(12,3) not null, "max_kg" numeric(12,3) not null, "notes" text null, primary key ("id"));`);
    this.addSql(`create index "cc_loading_tolerances_scope_idx" on "cc_loading_tolerances" ("organization_id", "tenant_id");`);

    this.addSql(`create table "cc_moulds" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "is_active" boolean not null default true, "updated_by_name" text null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "deleted_at" timestamptz null, "die_no" text not null, "mould_type" text not null, "description" text null, "size" text null, "finish" text null, "thickness_mm" numeric(6,2) null, "customer_id" uuid null, "customer_mould_no" text null, "store_location" text null, "heat_up_minutes" int null, primary key ("id"));`);
    this.addSql(`create index "cc_moulds_die_idx" on "cc_moulds" ("organization_id", "tenant_id", "die_no");`);
    this.addSql(`create index "cc_moulds_scope_idx" on "cc_moulds" ("organization_id", "tenant_id");`);

    this.addSql(`create table "cc_presses" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "is_active" boolean not null default true, "updated_by_name" text null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "deleted_at" timestamptz null, "number" int not null, "press_type" text not null, "daylights" int null, "usage" text not null, "is_working" boolean not null default true, "notes" text null, primary key ("id"));`);
    this.addSql(`create index "cc_presses_scope_idx" on "cc_presses" ("organization_id", "tenant_id");`);

    this.addSql(`create table "cc_price_rates" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "is_active" boolean not null default true, "updated_by_name" text null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "deleted_at" timestamptz null, "size_class" text not null, "grade" text not null, "thickness_from" numeric(6,2) null, "thickness_to" numeric(6,2) null, "rate_per_kg" numeric(14,2) not null, "currency" text not null, "notes" text null, primary key ("id"));`);
    this.addSql(`create index "cc_price_rates_scope_idx" on "cc_price_rates" ("organization_id", "tenant_id");`);

    this.addSql(`create table "cc_reactors" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "is_active" boolean not null default true, "updated_by_name" text null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "deleted_at" timestamptz null, "code" text not null, "capacity_kg" numeric(12,3) null, "notes" text null, primary key ("id"));`);
    this.addSql(`create index "cc_reactors_scope_idx" on "cc_reactors" ("organization_id", "tenant_id");`);
  }

}
