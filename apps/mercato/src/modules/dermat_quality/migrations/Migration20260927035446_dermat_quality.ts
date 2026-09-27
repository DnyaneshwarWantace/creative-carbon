import { Migration } from '@mikro-orm/migrations';

export class Migration20260927035446_dermat_quality extends Migration {

  override up(): void | Promise<void> {
    this.addSql(`create table "dermat_qa_documents" ("id" uuid not null default gen_random_uuid(), "organization_id" uuid not null, "tenant_id" uuid not null, "doc_no" text not null, "version" int not null, "title" text not null, "doc_type" text not null, "department" text null, "effective_date" text not null, "review_date" text null, "status" text not null default 'active', "notes" text null, "change_note" text null, "prepared_by_name" text null, "approved_by_name" text null, "history" jsonb null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "deleted_at" timestamptz null, primary key ("id"));`);
    this.addSql(`create index "dermat_qa_documents_scope_idx" on "dermat_qa_documents" ("organization_id", "tenant_id", "status");`);
    this.addSql(`alter table "dermat_qa_documents" add constraint "dermat_qa_documents_no_version_uq" unique ("organization_id", "tenant_id", "doc_no", "version");`);
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists "dermat_qa_documents" cascade;`);
  }

}
