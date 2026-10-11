import { Migration } from '@mikro-orm/migrations';

export class Migration20261011084331_cc_departments extends Migration {

  override up(): void | Promise<void> {
    this.addSql(`create table "cc_access_changes" ("id" uuid not null default gen_random_uuid(), "tenant_id" uuid not null, "organization_id" uuid not null, "subject_type" text not null, "subject_id" uuid not null, "subject_label" text not null, "action" text not null, "before" jsonb null, "after" jsonb not null, "changes" jsonb not null, "reason" text null, "outside" boolean not null default false, "actor_user_id" uuid null, "actor_name" text null, "undo_of" uuid null, "undone_at" timestamptz null, "undone_by_name" text null, "created_at" timestamptz not null, "updated_at" timestamptz not null, primary key ("id"));`);
    this.addSql(`create index "cc_access_changes_subject_idx" on "cc_access_changes" ("tenant_id", "subject_type", "subject_id", "created_at");`);

    this.addSql(`create table "cc_access_snapshots" ("id" uuid not null default gen_random_uuid(), "tenant_id" uuid not null, "subject_type" text not null, "subject_id" uuid not null, "state" jsonb not null, "updated_at" timestamptz not null, primary key ("id"));`);
    this.addSql(`alter table "cc_access_snapshots" add constraint "cc_access_snapshots_subject_uq" unique ("tenant_id", "subject_type", "subject_id");`);
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists "cc_access_changes" cascade;`);
    this.addSql(`drop table if exists "cc_access_snapshots" cascade;`);
  }

}
