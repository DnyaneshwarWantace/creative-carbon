import { Migration } from '@mikro-orm/migrations';

export class Migration20261011083808_cc_audit extends Migration {

  override up(): void | Promise<void> {
    this.addSql(`create table "cc_settings_changes" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "area" text not null, "setting_key" text not null, "label" text not null, "before" jsonb null, "after" jsonb null, "changes" jsonb not null, "meta" jsonb null, "actor_user_id" uuid null, "actor_name" text null, "status" text not null default 'live', "undone_at" timestamptz null, "undone_by_name" text null, "undo_reason" text null, "created_at" timestamptz not null, "updated_at" timestamptz not null, primary key ("id"));`);
    this.addSql(`create index "cc_settings_changes_scope_idx" on "cc_settings_changes" ("organization_id", "tenant_id", "created_at");`);
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists "cc_settings_changes" cascade;`);
  }

}
