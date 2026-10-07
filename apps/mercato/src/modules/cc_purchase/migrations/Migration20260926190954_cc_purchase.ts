import { Migration } from '@mikro-orm/migrations';

export class Migration20260926190954_cc_purchase extends Migration {

  override up(): void | Promise<void> {
    this.addSql(`create table "cc_purchase_indents" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "code" text not null, "status" text not null default 'submitted', "source" text not null default 'department', "department" text null, "needed_by" text null, "notes" text null, "lines" jsonb not null, "order_refs" jsonb null, "requested_by_name" text null, "approved_by_name" text null, "approved_at" timestamptz null, "decision_note" text null, "po_refs" jsonb null, "history" jsonb null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "deleted_at" timestamptz null, primary key ("id"));`);
    this.addSql(`create index "cc_purchase_indents_scope_idx" on "cc_purchase_indents" ("organization_id", "tenant_id", "status");`);
    this.addSql(`alter table "cc_purchase_indents" add constraint "cc_purchase_indents_code_uq" unique ("organization_id", "tenant_id", "code");`);
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists "cc_purchase_indents" cascade;`);
  }

}
