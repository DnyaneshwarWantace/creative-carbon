import { Migration } from '@mikro-orm/migrations';

export class Migration20261012125345_cc_crm extends Migration {

  override up(): void | Promise<void> {
    this.addSql(`create table "cc_crm_stages" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "stage_key" text not null, "label" text not null, "description" text null, "kind" text not null default 'open', "tone" text not null default 'neutral', "position" int not null, "system" boolean not null default false, "is_active" boolean not null default true, "questions" jsonb null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "deleted_at" timestamptz null, primary key ("id"));`);
    this.addSql(`create index "cc_crm_stages_scope_idx" on "cc_crm_stages" ("organization_id", "tenant_id", "position");`);

    this.addSql(`alter table "cc_enquiries" add "stage_answers" jsonb null;`);
  }

  override down(): void | Promise<void> {
    this.addSql(`alter table "cc_enquiries" drop column "stage_answers";`);
    this.addSql(`drop table if exists "cc_crm_stages" cascade;`);
  }

}
