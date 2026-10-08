import { Migration } from '@mikro-orm/migrations';

export class Migration20261007191708_cc_production extends Migration {

  override up(): void | Promise<void> {
    this.addSql(`create table "cc_coating_sheets" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "sheet_date" text not null, "dryer_id" uuid not null, "dryer_code" text not null, "rows" jsonb not null, "slots" jsonb not null, "status" text not null default 'draft', "issue_ids" jsonb null, "warnings" jsonb null, "posted_at" timestamptz null, "posted_by_name" text null, "notes" text null, "history" jsonb null, "updated_by_name" text null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "deleted_at" timestamptz null, primary key ("id"));`);
    this.addSql(`create unique index "cc_coating_sheets_day_unique_idx" on "cc_coating_sheets" ("organization_id", "dryer_id", "sheet_date") where deleted_at is null;`);
    this.addSql(`create index "cc_coating_sheets_scope_idx" on "cc_coating_sheets" ("organization_id", "tenant_id", "sheet_date");`);
  }

}
