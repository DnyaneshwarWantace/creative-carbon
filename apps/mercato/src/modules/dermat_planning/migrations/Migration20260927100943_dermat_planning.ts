import { Migration } from '@mikro-orm/migrations';

export class Migration20260927100943_dermat_planning extends Migration {

  override up(): void | Promise<void> {
    this.addSql(`alter table "dermat_planning_plans" add "store_status" text null, add "sent_at" timestamptz null, add "sent_by_name" text null, add "prepare_by" text null, add "store_note" text null, add "store_updated_at" timestamptz null, add "store_by_name" text null;`);
  }

  override down(): void | Promise<void> {
    this.addSql(`alter table "dermat_planning_plans" drop column "store_status", drop column "sent_at", drop column "sent_by_name", drop column "prepare_by", drop column "store_note", drop column "store_updated_at", drop column "store_by_name";`);
  }

}
