import { Migration } from '@mikro-orm/migrations';

export class Migration20261010172209_cc_purchase extends Migration {

  override up(): void | Promise<void> {
    this.addSql(`alter table "cc_grn_lines" add "qc_at" timestamptz null, add "qc_by_name" text null, add "qc_by_user_id" uuid null;`);
  }

  override down(): void | Promise<void> {
    this.addSql(`alter table "cc_grn_lines" drop column "qc_at", drop column "qc_by_name", drop column "qc_by_user_id";`);
  }

}
