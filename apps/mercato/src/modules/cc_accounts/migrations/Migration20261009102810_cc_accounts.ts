import { Migration } from '@mikro-orm/migrations';

export class Migration20261009102810_cc_accounts extends Migration {

  override up(): void | Promise<void> {
    this.addSql(`create table "cc_tally_pushes" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "code" text not null, "range_from" text not null, "range_to" text not null, "kinds" jsonb not null, "with_masters" boolean not null default true, "tally_url" text not null, "tally_company" text null, "documents" jsonb not null, "party_count" int not null default 0, "request_xml" text not null, "response_text" text null, "status" text not null, "attempts" jsonb not null, "pushed_by_name" text null, "created_at" timestamptz not null, "updated_at" timestamptz not null, primary key ("id"));`);
    this.addSql(`create index "cc_tally_pushes_scope_idx" on "cc_tally_pushes" ("organization_id", "tenant_id", "created_at");`);
    this.addSql(`alter table "cc_tally_pushes" add constraint "cc_tally_pushes_code_uq" unique ("organization_id", "tenant_id", "code");`);

    this.addSql(`alter table "cc_company_profiles" add "tally_settings" jsonb null;`);
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists "cc_tally_pushes";`);
    this.addSql(`alter table "cc_company_profiles" drop column "tally_settings";`);
  }

}
