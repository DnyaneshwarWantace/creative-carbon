import { Migration } from '@mikro-orm/migrations';

export class Migration20261014140000_cc_production extends Migration {

  override up(): void | Promise<void> {
    this.addSql(`create table "cc_tc_templates" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "is_active" boolean not null default true, "updated_by_name" text null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "deleted_at" timestamptz null, "name" text not null, "product_label" text not null, "grade" text not null, "standard" text not null default 'IS 2036 : 1995', "rows" jsonb not null, primary key ("id"));`);
    this.addSql(`create index "cc_tc_templates_scope_idx" on "cc_tc_templates" ("organization_id", "tenant_id");`);
    this.addSql(`create table "cc_test_certificates" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "is_active" boolean not null default true, "updated_by_name" text null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "deleted_at" timestamptz null, "code" text not null, "cert_date" text not null, "status" text not null default 'draft', "template_id" uuid null, "customer_id" uuid null, "customer_label" text null, "product_label" text not null, "grade" text not null, "standard" text not null, "thickness_mm" numeric(6,2) null, "traceability" text null, "order_id" uuid null, "rows" jsonb not null, "observed" jsonb null, "tested_by" text null, "verified_by" text null, "issued_at" timestamptz null, "issued_by_name" text null, "not_ok_reason" text null, "notes" text null, primary key ("id"));`);
    this.addSql(`create index "cc_test_certificates_scope_idx" on "cc_test_certificates" ("organization_id", "tenant_id");`);
    this.addSql(`alter table "cc_test_certificates" add constraint "cc_test_certificates_code_uq" unique ("organization_id", "tenant_id", "code");`);
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists "cc_test_certificates" cascade;`);
    this.addSql(`drop table if exists "cc_tc_templates" cascade;`);
  }

}
