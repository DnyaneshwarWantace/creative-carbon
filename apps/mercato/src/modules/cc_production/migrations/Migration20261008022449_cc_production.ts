import { Migration } from '@mikro-orm/migrations';

export class Migration20261008022449_cc_production extends Migration {

  override up(): void | Promise<void> {
    this.addSql(`create table "cc_press_batches" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "batch_no" text not null, "batch_month" text not null, "seq" int not null, "batch_date" text not null, "press_id" uuid not null, "press_number" int not null, "cycle_no" int null, "daylights" jsonb not null, "lot_choices" jsonb null, "picks" jsonb null, "outputs" jsonb null, "heating" jsonb null, "warnings" jsonb null, "checked_by" text null, "remark" text null, "reviewed_by" text null, "reviewed_at" timestamptz null, "status" text not null default 'draft', "cancel_reason" text null, "posted_at" timestamptz null, "posted_by_name" text null, "history" jsonb null, "updated_by_name" text null, "created_at" timestamptz not null, "updated_at" timestamptz not null, primary key ("id"));`);
    this.addSql(`create unique index "cc_press_batches_no_unique_idx" on "cc_press_batches" ("organization_id", "batch_month", "seq");`);
    this.addSql(`create index "cc_press_batches_scope_idx" on "cc_press_batches" ("organization_id", "tenant_id", "batch_date");`);
  }

}
