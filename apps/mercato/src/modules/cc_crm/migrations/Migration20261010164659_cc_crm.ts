import { Migration } from '@mikro-orm/migrations';

export class Migration20261010164659_cc_crm extends Migration {

  override up(): void | Promise<void> {
    this.addSql(`create table "cc_follow_ups" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "enquiry_id" uuid null, "quotation_id" uuid null, "customer_id" uuid null, "kind" text not null default 'call', "due_on" text not null, "note" text null, "owner_name" text null, "owner_user_id" uuid null, "status" text not null default 'planned', "outcome" text null, "done_at" timestamptz null, "done_by_name" text null, "done_by_user_id" uuid null, "created_by_name" text null, "created_by_user_id" uuid null, "history" jsonb not null default '[]', "created_at" timestamptz not null, "updated_at" timestamptz not null, "deleted_at" timestamptz null, primary key ("id"));`);
    this.addSql(`create index "cc_follow_ups_enquiry_idx" on "cc_follow_ups" ("enquiry_id");`);
    this.addSql(`create index "cc_follow_ups_due_idx" on "cc_follow_ups" ("organization_id", "tenant_id", "status", "due_on");`);
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists "cc_follow_ups" cascade;`);
  }

}
