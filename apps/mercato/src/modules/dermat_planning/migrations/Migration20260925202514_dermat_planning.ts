import { Migration } from '@mikro-orm/migrations';

export class Migration20260925202514_dermat_planning extends Migration {

  override up(): void | Promise<void> {
    this.addSql(`create table "dermat_planning_log" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "action" text not null, "order_id" uuid not null, "order_no" text not null, "to_order_id" uuid null, "to_order_no" text null, "product_id" uuid not null, "quantity" numeric(14,4) not null, "note" text null, "by_name" text null, "created_at" timestamptz not null, primary key ("id"));`);
    this.addSql(`create index "dermat_planning_log_product_idx" on "dermat_planning_log" ("organization_id", "tenant_id", "product_id");`);
    this.addSql(`create index "dermat_planning_log_order_idx" on "dermat_planning_log" ("organization_id", "tenant_id", "order_id");`);

    this.addSql(`create table "dermat_planning_plans" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "code" text not null, "name" text not null, "items" jsonb null, "notes" text null, "created_by_name" text null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "deleted_at" timestamptz null, primary key ("id"));`);
    this.addSql(`create index "dermat_planning_plans_scope_idx" on "dermat_planning_plans" ("organization_id", "tenant_id");`);
    this.addSql(`alter table "dermat_planning_plans" add constraint "dermat_planning_plans_code_uq" unique ("organization_id", "tenant_id", "code");`);

    this.addSql(`create table "dermat_planning_reservations" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "order_id" uuid not null, "order_no" text not null, "product_id" uuid not null, "quantity" numeric(14,4) not null, "note" text null, "by_name" text null, "since" timestamptz not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, primary key ("id"));`);
    this.addSql(`create index "dermat_planning_reservations_product_idx" on "dermat_planning_reservations" ("organization_id", "tenant_id", "product_id");`);
    this.addSql(`alter table "dermat_planning_reservations" add constraint "dermat_planning_reservations_order_product_uq" unique ("organization_id", "tenant_id", "order_id", "product_id");`);
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists "dermat_planning_reservations" cascade;`);
    this.addSql(`drop table if exists "dermat_planning_plans" cascade;`);
    this.addSql(`drop table if exists "dermat_planning_log" cascade;`);
  }

}
