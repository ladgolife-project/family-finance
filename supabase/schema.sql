


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';


SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."financial_goal_contributions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "goal_id" "uuid" NOT NULL,
    "family_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "amount" numeric NOT NULL,
    "contribution_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "description" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "account_id" "uuid" NOT NULL,
    CONSTRAINT "financial_goal_contributions_amount_positive" CHECK (("amount" > (0)::numeric))
);


ALTER TABLE "public"."financial_goal_contributions" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."add_goal_contribution"("p_goal_id" "uuid", "p_account_id" "uuid", "p_amount" numeric, "p_contribution_date" "date", "p_description" "text" DEFAULT NULL::"text") RETURNS "public"."financial_goal_contributions"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  v_user_id uuid;
  v_family_id uuid;
  v_goal public.financial_goals%ROWTYPE;
  v_account public.accounts%ROWTYPE;
  v_balance numeric;
  v_allocated numeric;
  v_available numeric;
  v_remaining_target numeric;
  v_contribution public.financial_goal_contributions%ROWTYPE;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'User belum login.';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Nominal kontribusi harus lebih dari 0.';
  END IF;

  SELECT fm.family_id
  INTO v_family_id
  FROM public.family_members fm
  WHERE fm.user_id = v_user_id
  LIMIT 1;

  IF v_family_id IS NULL THEN
    RAISE EXCEPTION 'Data keluarga tidak ditemukan.';
  END IF;

  -- Lock goal
  SELECT *
  INTO v_goal
  FROM public.financial_goals
  WHERE id = p_goal_id
    AND family_id = v_family_id
    AND is_active = true
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Financial goal tidak ditemukan.';
  END IF;

  -- Hitung sisa target
  v_remaining_target :=
    v_goal.target_amount - v_goal.current_amount;

  -- Validasi target goal
  IF v_remaining_target <= 0 THEN
    RAISE EXCEPTION
      'Target goal sudah tercapai. Tidak ada dana yang perlu dialokasikan lagi.';
  END IF;

  IF p_amount > v_remaining_target THEN
    RAISE EXCEPTION
      'Nominal melebihi sisa target goal. Maksimal yang dapat dialokasikan: %.',
      v_remaining_target;
  END IF;

  -- Lock account
  SELECT *
  INTO v_account
  FROM public.accounts
  WHERE id = p_account_id
    AND family_id = v_family_id
    AND is_active = true
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Rekening sumber tidak ditemukan.';
  END IF;

  -- Ambil saldo aktual rekening
  SELECT ab.balance
  INTO v_balance
  FROM public.account_balances ab
  WHERE ab.account_id = p_account_id
    AND ab.family_id = v_family_id;

  IF v_balance IS NULL THEN
    RAISE EXCEPTION 'Saldo rekening tidak dapat ditemukan.';
  END IF;

  -- Hitung total dana yang sudah dialokasikan ke semua goal
  SELECT COALESCE(SUM(c.amount), 0)
  INTO v_allocated
  FROM public.financial_goal_contributions c
  WHERE c.account_id = p_account_id
    AND c.family_id = v_family_id;

  -- Saldo yang benar-benar masih bisa dialokasikan
  v_available := v_balance - v_allocated;

  IF v_available < p_amount THEN
    RAISE EXCEPTION
      'Saldo tersedia untuk dialokasikan tidak mencukupi. Saldo tersedia: %.',
      v_available;
  END IF;

  -- Simpan kontribusi
  INSERT INTO public.financial_goal_contributions (
    goal_id,
    account_id,
    family_id,
    user_id,
    amount,
    contribution_date,
    description
  )
  VALUES (
    v_goal.id,
    v_account.id,
    v_family_id,
    v_user_id,
    p_amount,
    COALESCE(p_contribution_date, CURRENT_DATE),
    NULLIF(TRIM(p_description), '')
  )
  RETURNING *
  INTO v_contribution;

  -- Update akumulasi goal
  UPDATE public.financial_goals
  SET
    current_amount = current_amount + p_amount,
    updated_at = NOW()
  WHERE id = v_goal.id
    AND family_id = v_family_id;

  RETURN v_contribution;
END;
$$;


ALTER FUNCTION "public"."add_goal_contribution"("p_goal_id" "uuid", "p_account_id" "uuid", "p_amount" numeric, "p_contribution_date" "date", "p_description" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_transaction"("p_account_id" "uuid", "p_category_id" "uuid", "p_type" "text", "p_amount" numeric, "p_transaction_date" "date", "p_description" "text" DEFAULT NULL::"text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  v_user_id uuid;
  v_family_id uuid;
  v_transaction_id uuid;
  v_account_family_id uuid;
  v_category_family_id uuid;
  v_category_type text;
  v_balance numeric;
  v_allocated numeric;
  v_available numeric;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Sesi login tidak ditemukan.';
  END IF;

  IF p_type NOT IN ('income', 'expense') THEN
    RAISE EXCEPTION 'Jenis transaksi tidak valid.';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Nominal harus lebih dari 0.';
  END IF;

  IF p_transaction_date IS NULL THEN
    RAISE EXCEPTION 'Tanggal transaksi wajib diisi.';
  END IF;

  -- Cari family user
  SELECT fm.family_id
  INTO v_family_id
  FROM public.family_members fm
  WHERE fm.user_id = v_user_id
  LIMIT 1;

  IF v_family_id IS NULL THEN
    RAISE EXCEPTION 'Keluarga user tidak ditemukan.';
  END IF;

  -- Validasi rekening
  SELECT a.family_id
  INTO v_account_family_id
  FROM public.accounts a
  WHERE a.id = p_account_id
    AND a.is_active = true;

  IF v_account_family_id IS NULL THEN
    RAISE EXCEPTION 'Rekening tidak ditemukan atau tidak aktif.';
  END IF;

  IF v_account_family_id <> v_family_id THEN
    RAISE EXCEPTION 'Rekening bukan milik keluarga user.';
  END IF;

  -- Validasi kategori
  SELECT c.family_id, c.type
  INTO v_category_family_id, v_category_type
  FROM public.categories c
  WHERE c.id = p_category_id;

  IF v_category_family_id IS NULL THEN
    RAISE EXCEPTION 'Kategori tidak ditemukan.';
  END IF;

  IF v_category_family_id <> v_family_id THEN
    RAISE EXCEPTION 'Kategori bukan milik keluarga user.';
  END IF;

  IF v_category_type <> p_type THEN
    RAISE EXCEPTION 'Jenis kategori tidak sesuai dengan jenis transaksi.';
  END IF;

  /*
    Lock rekening terlebih dahulu.

    Ini memastikan transaksi expense dan goal allocation
    yang menggunakan rekening yang sama tidak dapat
    membaca saldo pada kondisi yang sama secara bersamaan.
  */
  PERFORM 1
  FROM public.accounts a
  WHERE a.id = p_account_id
    AND a.family_id = v_family_id
    AND a.is_active = true
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Rekening tidak ditemukan atau tidak aktif.';
  END IF;

  -- Validasi saldo untuk expense
  IF p_type = 'expense' THEN

    -- Saldo aktual rekening
    SELECT ab.balance
    INTO v_balance
    FROM public.account_balances ab
    WHERE ab.account_id = p_account_id
      AND ab.family_id = v_family_id;

    IF v_balance IS NULL THEN
      RAISE EXCEPTION 'Saldo rekening tidak ditemukan.';
    END IF;

    -- Total dana yang sudah dialokasikan ke Goal
    SELECT COALESCE(SUM(c.amount), 0)
    INTO v_allocated
    FROM public.financial_goal_contributions c
    WHERE c.account_id = p_account_id
      AND c.family_id = v_family_id;

    -- Saldo yang benar-benar boleh digunakan
    v_available := v_balance - v_allocated;

    IF v_available < p_amount THEN
      RAISE EXCEPTION
        'Saldo tersedia tidak mencukupi untuk pengeluaran ini. Saldo tersedia: %.',
        v_available;
    END IF;

  END IF;

  -- Simpan transaksi
  INSERT INTO public.transactions (
    family_id,
    account_id,
    category_id,
    user_id,
    type,
    amount,
    transaction_date,
    description
  )
  VALUES (
    v_family_id,
    p_account_id,
    p_category_id,
    v_user_id,
    p_type,
    p_amount,
    p_transaction_date,
    NULLIF(TRIM(p_description), '')
  )
  RETURNING id
  INTO v_transaction_id;

  RETURN v_transaction_id;
END;
$$;


ALTER FUNCTION "public"."create_transaction"("p_account_id" "uuid", "p_category_id" "uuid", "p_type" "text", "p_amount" numeric, "p_transaction_date" "date", "p_description" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_transfer"("p_from_account_id" "uuid", "p_to_account_id" "uuid", "p_amount" numeric, "p_transfer_date" "date", "p_description" "text" DEFAULT NULL::"text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  v_user_id uuid;
  v_family_id uuid;
  v_transfer_id uuid;

  v_from_family_id uuid;
  v_to_family_id uuid;

  v_balance numeric;
  v_allocated numeric;
  v_available numeric;
BEGIN

  -- =========================================================
  -- 1. AUTH
  -- =========================================================

  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Sesi login tidak ditemukan.';
  END IF;


  -- =========================================================
  -- 2. VALIDASI INPUT
  -- =========================================================

  IF p_from_account_id IS NULL
     OR p_to_account_id IS NULL THEN
    RAISE EXCEPTION
      'Rekening sumber dan tujuan wajib dipilih.';
  END IF;

  IF p_from_account_id = p_to_account_id THEN
    RAISE EXCEPTION
      'Rekening sumber dan tujuan harus berbeda.';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION
      'Nominal transfer harus lebih dari 0.';
  END IF;

  IF p_transfer_date IS NULL THEN
    RAISE EXCEPTION
      'Tanggal transfer wajib diisi.';
  END IF;


  -- =========================================================
  -- 3. CARI FAMILY USER
  -- =========================================================

  SELECT fm.family_id
  INTO v_family_id
  FROM public.family_members fm
  WHERE fm.user_id = v_user_id
  LIMIT 1;

  IF v_family_id IS NULL THEN
    RAISE EXCEPTION
      'Keluarga user tidak ditemukan.';
  END IF;


  -- =========================================================
  -- 4. VALIDASI KEPEMILIKAN REKENING
  -- =========================================================

  SELECT a.family_id
  INTO v_from_family_id
  FROM public.accounts a
  WHERE a.id = p_from_account_id
    AND a.is_active = true;

  IF v_from_family_id IS NULL THEN
    RAISE EXCEPTION
      'Rekening sumber tidak ditemukan atau tidak aktif.';
  END IF;


  SELECT a.family_id
  INTO v_to_family_id
  FROM public.accounts a
  WHERE a.id = p_to_account_id
    AND a.is_active = true;

  IF v_to_family_id IS NULL THEN
    RAISE EXCEPTION
      'Rekening tujuan tidak ditemukan atau tidak aktif.';
  END IF;


  IF v_from_family_id <> v_family_id THEN
    RAISE EXCEPTION
      'Rekening sumber bukan milik keluarga user.';
  END IF;

  IF v_to_family_id <> v_family_id THEN
    RAISE EXCEPTION
      'Rekening tujuan bukan milik keluarga user.';
  END IF;


  -- =========================================================
  -- 5. LOCK KEDUA REKENING
  -- =========================================================

  IF p_from_account_id < p_to_account_id THEN

    PERFORM 1
    FROM public.accounts a
    WHERE a.id = p_from_account_id
      AND a.family_id = v_family_id
      AND a.is_active = true
    FOR UPDATE;

    PERFORM 1
    FROM public.accounts a
    WHERE a.id = p_to_account_id
      AND a.family_id = v_family_id
      AND a.is_active = true
    FOR UPDATE;

  ELSE

    PERFORM 1
    FROM public.accounts a
    WHERE a.id = p_to_account_id
      AND a.family_id = v_family_id
      AND a.is_active = true
    FOR UPDATE;

    PERFORM 1
    FROM public.accounts a
    WHERE a.id = p_from_account_id
      AND a.family_id = v_family_id
      AND a.is_active = true
    FOR UPDATE;

  END IF;


  -- =========================================================
  -- 6. AMBIL SALDO AKTUAL REKENING SUMBER
  -- =========================================================

  SELECT ab.balance
  INTO v_balance
  FROM public.account_balances ab
  WHERE ab.account_id = p_from_account_id
    AND ab.family_id = v_family_id;

  IF v_balance IS NULL THEN
    RAISE EXCEPTION
      'Saldo rekening sumber tidak ditemukan.';
  END IF;


  -- =========================================================
  -- 7. HITUNG DANA YANG SUDAH DICADANGKAN KE GOAL
  -- =========================================================

  SELECT COALESCE(SUM(c.amount), 0)
  INTO v_allocated
  FROM public.financial_goal_contributions c
  WHERE c.account_id = p_from_account_id
    AND c.family_id = v_family_id;


  -- =========================================================
  -- 8. HITUNG SALDO TERSEDIA
  -- =========================================================

  v_available := v_balance - v_allocated;


  -- =========================================================
  -- 9. VALIDASI SALDO TERSEDIA
  -- =========================================================

  IF v_available < p_amount THEN
    RAISE EXCEPTION
      'Saldo tersedia tidak mencukupi untuk transfer ini. Saldo tersedia: %.',
      v_available;
  END IF;


  -- =========================================================
  -- 10. INSERT TRANSFER
  -- =========================================================

  INSERT INTO public.transfers (
    family_id,
    from_account_id,
    to_account_id,
    user_id,
    amount,
    transfer_date,
    description
  )
  VALUES (
    v_family_id,
    p_from_account_id,
    p_to_account_id,
    v_user_id,
    p_amount,
    p_transfer_date,
    NULLIF(TRIM(p_description), '')
  )
  RETURNING id
  INTO v_transfer_id;


  -- =========================================================
  -- 11. RETURN
  -- =========================================================

  RETURN v_transfer_id;

END;
$$;


ALTER FUNCTION "public"."create_transfer"("p_from_account_id" "uuid", "p_to_account_id" "uuid", "p_amount" numeric, "p_transfer_date" "date", "p_description" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."delete_financial_goal"("p_goal_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  v_family_id uuid;
BEGIN
  SELECT fg.family_id
  INTO v_family_id
  FROM public.financial_goals fg
  WHERE fg.id = p_goal_id;

  IF v_family_id IS NULL THEN
    RAISE EXCEPTION 'Financial goal tidak ditemukan.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.family_members fm
    WHERE fm.family_id = v_family_id
      AND fm.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION
      'Kamu tidak memiliki akses ke financial goal ini.';
  END IF;

  DELETE FROM public.financial_goal_contributions
  WHERE goal_id = p_goal_id
    AND family_id = v_family_id;

  DELETE FROM public.financial_goals
  WHERE id = p_goal_id
    AND family_id = v_family_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Financial goal gagal dihapus.';
  END IF;
END;
$$;


ALTER FUNCTION "public"."delete_financial_goal"("p_goal_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."delete_goal_contribution"("p_contribution_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  v_amount numeric;
  v_goal_id uuid;
  v_account_id uuid;
  v_family_id uuid;
  v_current_amount numeric;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'User belum login.';
  END IF;

  /*
    Ambil contribution yang akan dihapus.
    account_id ikut diambil untuk memastikan
    histori sumber rekening tetap valid.
  */
  SELECT
    c.amount,
    c.goal_id,
    c.account_id,
    c.family_id
  INTO
    v_amount,
    v_goal_id,
    v_account_id,
    v_family_id
  FROM public.financial_goal_contributions c
  WHERE c.id = p_contribution_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Kontribusi tidak ditemukan.';
  END IF;

  /*
    Pastikan user merupakan anggota family
    dari contribution tersebut.
  */
  IF NOT EXISTS (
    SELECT 1
    FROM public.family_members fm
    WHERE fm.family_id = v_family_id
      AND fm.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Kamu tidak memiliki akses ke kontribusi ini.';
  END IF;

  /*
    Lock goal sebelum mengubah current_amount.
  */
  SELECT current_amount
  INTO v_current_amount
  FROM public.financial_goals
  WHERE id = v_goal_id
    AND family_id = v_family_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Financial goal tidak ditemukan.';
  END IF;

  /*
    Jangan biarkan current_amount menjadi tidak konsisten
    dengan histori contribution.
  */
  IF v_current_amount < v_amount THEN
    RAISE EXCEPTION
      'Saldo goal tidak konsisten dengan riwayat kontribusi.';
  END IF;

  /*
    Kurangi progress Goal.
  */
  UPDATE public.financial_goals
  SET
    current_amount = current_amount - v_amount,
    updated_at = NOW()
  WHERE id = v_goal_id
    AND family_id = v_family_id;

  /*
    Hapus histori contribution.
  */
  DELETE FROM public.financial_goal_contributions
  WHERE id = p_contribution_id
    AND goal_id = v_goal_id
    AND account_id = v_account_id
    AND family_id = v_family_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Kontribusi gagal dihapus.';
  END IF;

END;
$$;


ALTER FUNCTION "public"."delete_goal_contribution"("p_contribution_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."delete_transfer"("p_transfer_id" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  v_user_id uuid;
  v_family_id uuid;
  v_transfer_id uuid;

  v_from_account_id uuid;
  v_to_account_id uuid;
BEGIN
  -- =========================================================
  -- 1. AUTH
  -- =========================================================

  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Sesi login tidak ditemukan.';
  END IF;


  -- =========================================================
  -- 2. VALIDASI ID
  -- =========================================================

  IF p_transfer_id IS NULL THEN
    RAISE EXCEPTION 'Transfer tidak ditemukan.';
  END IF;


  -- =========================================================
  -- 3. CARI FAMILY USER
  -- =========================================================

  SELECT fm.family_id
  INTO v_family_id
  FROM public.family_members fm
  WHERE fm.user_id = v_user_id
  LIMIT 1;

  IF v_family_id IS NULL THEN
    RAISE EXCEPTION 'Keluarga user tidak ditemukan.';
  END IF;


  -- =========================================================
  -- 4. AMBIL TRANSFER
  -- =========================================================

  SELECT
    tr.from_account_id,
    tr.to_account_id
  INTO
    v_from_account_id,
    v_to_account_id
  FROM public.transfers tr
  WHERE tr.id = p_transfer_id
    AND tr.family_id = v_family_id
    AND tr.user_id = v_user_id;

  IF v_from_account_id IS NULL THEN
    RAISE EXCEPTION
      'Transfer tidak ditemukan atau bukan milik Anda.';
  END IF;


  -- =========================================================
  -- 5. LOCK REKENING TERKAIT
  -- =========================================================
  --
  -- Transfer memengaruhi dua rekening.
  -- Lock berdasarkan urutan UUID.
  -- =========================================================

  IF v_from_account_id < v_to_account_id THEN

    PERFORM 1
    FROM public.accounts a
    WHERE a.id = v_from_account_id
      AND a.family_id = v_family_id
    FOR UPDATE;

    PERFORM 1
    FROM public.accounts a
    WHERE a.id = v_to_account_id
      AND a.family_id = v_family_id
    FOR UPDATE;

  ELSE

    PERFORM 1
    FROM public.accounts a
    WHERE a.id = v_to_account_id
      AND a.family_id = v_family_id
    FOR UPDATE;

    PERFORM 1
    FROM public.accounts a
    WHERE a.id = v_from_account_id
      AND a.family_id = v_family_id
    FOR UPDATE;

  END IF;


  -- =========================================================
  -- 6. DELETE
  -- =========================================================

  DELETE FROM public.transfers
  WHERE id = p_transfer_id
    AND family_id = v_family_id
    AND user_id = v_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transfer gagal dihapus.';
  END IF;


  -- =========================================================
  -- 7. RETURN ID
  -- =========================================================

  v_transfer_id := p_transfer_id;

  RETURN v_transfer_id;

END;
$$;


ALTER FUNCTION "public"."delete_transfer"("p_transfer_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_family_dashboard"("target_family_id" "uuid", "target_month" "date" DEFAULT CURRENT_DATE) RETURNS TABLE("total_balance" numeric, "monthly_income" numeric, "monthly_expense" numeric, "transaction_count" bigint)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$

  SELECT
    COALESCE(
      (
        SELECT SUM(ab.balance)
        FROM public.account_balances ab
        WHERE ab.family_id = target_family_id
      ),
      0
    ) AS total_balance,

    COALESCE(
      (
        SELECT SUM(t.amount)
        FROM public.transactions t
        WHERE t.family_id = target_family_id
          AND t.type = 'income'
          AND date_trunc('month', t.transaction_date)
              = date_trunc('month', target_month)
      ),
      0
    ) AS monthly_income,

    COALESCE(
      (
        SELECT SUM(t.amount)
        FROM public.transactions t
        WHERE t.family_id = target_family_id
          AND t.type = 'expense'
          AND date_trunc('month', t.transaction_date)
              = date_trunc('month', target_month)
      ),
      0
    ) AS monthly_expense,

    (
      SELECT COUNT(*)
      FROM public.transactions t
      WHERE t.family_id = target_family_id
        AND date_trunc('month', t.transaction_date)
            = date_trunc('month', target_month)
    ) AS transaction_count

  WHERE public.is_family_member(target_family_id);

$$;


ALTER FUNCTION "public"."get_family_dashboard"("target_family_id" "uuid", "target_month" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  INSERT INTO public.profiles (
    id,
    full_name
  )
  VALUES (
    new.id,
    COALESCE(new.raw_user_meta_data ->> 'full_name', '')
  );

  RETURN new;
END;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_family_member"("target_family_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.family_members
    WHERE family_id = target_family_id
      AND user_id = auth.uid()
  );
$$;


ALTER FUNCTION "public"."is_family_member"("target_family_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."process_recurring_transaction"("p_recurring_id" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$

DECLARE
  v_user_id uuid;
  v_family_id uuid;
  v_transaction_id uuid;

  v_account_id uuid;
  v_category_id uuid;
  v_type text;
  v_amount numeric;
  v_next_date date;
  v_frequency text;
  v_description text;

  v_account_family_id uuid;
  v_category_family_id uuid;
  v_category_type text;

  v_balance numeric;
  v_allocated numeric;
  v_available numeric;

BEGIN

  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Sesi login tidak ditemukan.';
  END IF;


  /*
    Ambil recurring transaction sekaligus family_id.
  */
  SELECT
    rt.family_id,
    rt.account_id,
    rt.category_id,
    rt.type,
    rt.amount,
    rt.next_date,
    rt.frequency,
    rt.description
  INTO
    v_family_id,
    v_account_id,
    v_category_id,
    v_type,
    v_amount,
    v_next_date,
    v_frequency,
    v_description
  FROM public.recurring_transactions rt
  WHERE rt.id = p_recurring_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Recurring transaction tidak ditemukan.';
  END IF;


  /*
    Pastikan user adalah anggota family recurring transaction.
  */
  IF NOT public.is_family_member(v_family_id) THEN
    RAISE EXCEPTION
      'Kamu tidak memiliki akses ke recurring transaction ini.';
  END IF;


  /*
    Validasi recurring masih aktif.
  */
  IF NOT EXISTS (
    SELECT 1
    FROM public.recurring_transactions rt
    WHERE rt.id = p_recurring_id
      AND rt.family_id = v_family_id
      AND rt.is_active = true
  ) THEN
    RAISE EXCEPTION 'Recurring transaction tidak aktif.';
  END IF;


  IF v_next_date IS NULL THEN
    RAISE EXCEPTION 'Tanggal recurring berikutnya tidak ditemukan.';
  END IF;


  IF v_next_date > current_date THEN
    RAISE EXCEPTION 'Recurring transaction belum jatuh tempo.';
  END IF;


  IF v_type NOT IN ('income', 'expense') THEN
    RAISE EXCEPTION 'Jenis recurring transaction tidak valid.';
  END IF;


  IF v_amount IS NULL OR v_amount <= 0 THEN
    RAISE EXCEPTION
      'Nominal recurring transaction harus lebih dari 0.';
  END IF;


  /*
    Validasi account.
  */
  SELECT a.family_id
  INTO v_account_family_id
  FROM public.accounts a
  WHERE a.id = v_account_id
    AND a.is_active = true;

  IF v_account_family_id IS NULL THEN
    RAISE EXCEPTION
      'Rekening tidak ditemukan atau tidak aktif.';
  END IF;


  IF v_account_family_id <> v_family_id THEN
    RAISE EXCEPTION
      'Rekening bukan milik keluarga user.';
  END IF;


  /*
    Validasi category.
  */
  SELECT
    c.family_id,
    c.type
  INTO
    v_category_family_id,
    v_category_type
  FROM public.categories c
  WHERE c.id = v_category_id;

  IF v_category_family_id IS NULL THEN
    RAISE EXCEPTION 'Kategori tidak ditemukan.';
  END IF;


  IF v_category_family_id <> v_family_id THEN
    RAISE EXCEPTION
      'Kategori bukan milik keluarga user.';
  END IF;


  IF v_category_type <> v_type THEN
    RAISE EXCEPTION
      'Jenis kategori tidak sesuai dengan jenis recurring transaction.';
  END IF;


  /*
    Lock account untuk mencegah race condition.
  */
  PERFORM 1
  FROM public.accounts a
  WHERE a.id = v_account_id
    AND a.family_id = v_family_id
    AND a.is_active = true
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'Rekening tidak ditemukan atau tidak aktif.';
  END IF;


  /*
    Cek saldo tersedia untuk expense.
    Available = actual balance - goal allocation.
  */
  IF v_type = 'expense' THEN

    SELECT ab.balance
    INTO v_balance
    FROM public.account_balances ab
    WHERE ab.account_id = v_account_id
      AND ab.family_id = v_family_id;

    IF v_balance IS NULL THEN
      RAISE EXCEPTION 'Saldo rekening tidak ditemukan.';
    END IF;


    SELECT COALESCE(SUM(c.amount), 0)
    INTO v_allocated
    FROM public.financial_goal_contributions c
    WHERE c.account_id = v_account_id
      AND c.family_id = v_family_id;


    v_available := v_balance - v_allocated;


    IF v_available < v_amount THEN
      RAISE EXCEPTION
        'Saldo tersedia tidak mencukupi untuk recurring transaction.';
    END IF;

  END IF;


  /*
    Duplicate protection.
  */
  IF EXISTS (
    SELECT 1
    FROM public.transactions t
    WHERE t.family_id = v_family_id
      AND t.recurring_transaction_id = p_recurring_id
      AND t.transaction_date = v_next_date
  ) THEN
    RAISE EXCEPTION
      'Recurring transaction untuk tanggal tersebut sudah diproses.';
  END IF;


  /*
    Insert transaction.
  */
  INSERT INTO public.transactions (
    family_id,
    account_id,
    category_id,
    user_id,
    type,
    amount,
    transaction_date,
    description,
    recurring_transaction_id
  )
  VALUES (
    v_family_id,
    v_account_id,
    v_category_id,
    v_user_id,
    v_type,
    v_amount,
    v_next_date,
    NULLIF(TRIM(v_description), ''),
    p_recurring_id
  )
  RETURNING id INTO v_transaction_id;


  /*
    Advance next_date.
  */
  UPDATE public.recurring_transactions
  SET
    next_date =
      CASE v_frequency
        WHEN 'daily' THEN v_next_date + interval '1 day'
        WHEN 'weekly' THEN v_next_date + interval '1 week'
        WHEN 'monthly' THEN v_next_date + interval '1 month'
        WHEN 'yearly' THEN v_next_date + interval '1 year'
        ELSE NULL
      END,
    updated_at = now()
  WHERE id = p_recurring_id
    AND family_id = v_family_id;


  IF NOT FOUND THEN
    RAISE EXCEPTION
      'Gagal memperbarui jadwal recurring transaction.';
  END IF;


  RETURN v_transaction_id;

END;
$$;


ALTER FUNCTION "public"."process_recurring_transaction"("p_recurring_id" "uuid") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."financial_goals" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "family_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "target_amount" numeric NOT NULL,
    "current_amount" numeric DEFAULT 0 NOT NULL,
    "deadline" "date",
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "financial_goals_current_amount_non_negative" CHECK (("current_amount" >= (0)::numeric)),
    CONSTRAINT "financial_goals_target_amount_positive" CHECK (("target_amount" > (0)::numeric))
);


ALTER TABLE "public"."financial_goals" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_financial_goal"("p_goal_id" "uuid", "p_name" "text", "p_description" "text" DEFAULT NULL::"text", "p_target_amount" numeric DEFAULT NULL::numeric, "p_deadline" "date" DEFAULT NULL::"date") RETURNS "public"."financial_goals"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  v_user_id uuid;
  v_family_id uuid;
  v_goal public.financial_goals%ROWTYPE;
  v_target_amount numeric;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'User belum login.';
  END IF;

  SELECT fm.family_id
  INTO v_family_id
  FROM public.family_members fm
  WHERE fm.user_id = v_user_id
  LIMIT 1;

  IF v_family_id IS NULL THEN
    RAISE EXCEPTION 'Data keluarga tidak ditemukan.';
  END IF;

  SELECT *
  INTO v_goal
  FROM public.financial_goals
  WHERE id = p_goal_id
    AND family_id = v_family_id
    AND is_active = true
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Financial goal tidak ditemukan.';
  END IF;

  IF p_name IS NULL OR NULLIF(TRIM(p_name), '') IS NULL THEN
    RAISE EXCEPTION 'Nama goal wajib diisi.';
  END IF;

  v_target_amount := COALESCE(p_target_amount, v_goal.target_amount);

  IF v_target_amount <= 0 THEN
    RAISE EXCEPTION 'Target goal harus lebih dari 0.';
  END IF;

  IF v_target_amount < v_goal.current_amount THEN
    RAISE EXCEPTION
      'Target baru tidak boleh lebih kecil dari dana yang sudah terkumpul. Minimal target: %.',
      v_goal.current_amount;
  END IF;

  UPDATE public.financial_goals
  SET
    name = TRIM(p_name),
    description = NULLIF(TRIM(p_description), ''),
    target_amount = v_target_amount,
    deadline = p_deadline,
    updated_at = NOW()
  WHERE id = v_goal.id
    AND family_id = v_family_id
  RETURNING *
  INTO v_goal;

  RETURN v_goal;
END;
$$;


ALTER FUNCTION "public"."update_financial_goal"("p_goal_id" "uuid", "p_name" "text", "p_description" "text", "p_target_amount" numeric, "p_deadline" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_transaction"("p_transaction_id" "uuid", "p_account_id" "uuid", "p_category_id" "uuid", "p_type" "text", "p_amount" numeric, "p_transaction_date" "date", "p_description" "text" DEFAULT NULL::"text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  v_user_id uuid;
  v_family_id uuid;
  v_transaction_id uuid;

  v_old_account_id uuid;
  v_old_amount numeric;
  v_old_type text;

  v_account_family_id uuid;
  v_category_family_id uuid;
  v_category_type text;

  v_balance numeric;
  v_allocated numeric;
  v_available numeric;
BEGIN

  -- =========================================================
  -- 1. AUTH
  -- =========================================================

  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Sesi login tidak ditemukan.';
  END IF;


  -- =========================================================
  -- 2. VALIDASI INPUT
  -- =========================================================

  IF p_transaction_id IS NULL THEN
    RAISE EXCEPTION 'Transaksi tidak ditemukan.';
  END IF;

  IF p_type NOT IN ('income', 'expense') THEN
    RAISE EXCEPTION 'Jenis transaksi tidak valid.';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Nominal transaksi harus lebih dari 0.';
  END IF;

  IF p_transaction_date IS NULL THEN
    RAISE EXCEPTION 'Tanggal transaksi wajib diisi.';
  END IF;


  -- =========================================================
  -- 3. CARI FAMILY USER
  -- =========================================================

  SELECT fm.family_id
  INTO v_family_id
  FROM public.family_members fm
  WHERE fm.user_id = v_user_id
  LIMIT 1;

  IF v_family_id IS NULL THEN
    RAISE EXCEPTION 'Keluarga user tidak ditemukan.';
  END IF;


  -- =========================================================
  -- 4. AMBIL TRANSAKSI LAMA
  -- =========================================================

  SELECT
    t.account_id,
    t.amount,
    t.type
  INTO
    v_old_account_id,
    v_old_amount,
    v_old_type
  FROM public.transactions t
  WHERE t.id = p_transaction_id
    AND t.family_id = v_family_id
    AND t.user_id = v_user_id;

  IF v_old_account_id IS NULL THEN
    RAISE EXCEPTION
      'Transaksi tidak ditemukan atau bukan milik Anda.';
  END IF;


  -- =========================================================
  -- 5. VALIDASI REKENING BARU
  -- =========================================================

  SELECT a.family_id
  INTO v_account_family_id
  FROM public.accounts a
  WHERE a.id = p_account_id
    AND a.is_active = true;

  IF v_account_family_id IS NULL THEN
    RAISE EXCEPTION
      'Rekening tidak ditemukan atau tidak aktif.';
  END IF;

  IF v_account_family_id <> v_family_id THEN
    RAISE EXCEPTION
      'Rekening bukan milik keluarga user.';
  END IF;


  -- =========================================================
  -- 6. VALIDASI KATEGORI
  -- =========================================================

  SELECT
    c.family_id,
    c.type
  INTO
    v_category_family_id,
    v_category_type
  FROM public.categories c
  WHERE c.id = p_category_id;

  IF v_category_family_id IS NULL THEN
    RAISE EXCEPTION 'Kategori tidak ditemukan.';
  END IF;

  IF v_category_family_id <> v_family_id THEN
    RAISE EXCEPTION
      'Kategori bukan milik keluarga user.';
  END IF;

  IF v_category_type <> p_type THEN
    RAISE EXCEPTION
      'Jenis kategori tidak sesuai dengan jenis transaksi.';
  END IF;


  -- =========================================================
  -- 7. LOCK REKENING
  -- =========================================================

  IF v_old_account_id = p_account_id THEN

    PERFORM 1
    FROM public.accounts a
    WHERE a.id = p_account_id
      AND a.family_id = v_family_id
      AND a.is_active = true
    FOR UPDATE;

  ELSIF v_old_account_id < p_account_id THEN

    PERFORM 1
    FROM public.accounts a
    WHERE a.id = v_old_account_id
      AND a.family_id = v_family_id
      AND a.is_active = true
    FOR UPDATE;

    PERFORM 1
    FROM public.accounts a
    WHERE a.id = p_account_id
      AND a.family_id = v_family_id
      AND a.is_active = true
    FOR UPDATE;

  ELSE

    PERFORM 1
    FROM public.accounts a
    WHERE a.id = p_account_id
      AND a.family_id = v_family_id
      AND a.is_active = true
    FOR UPDATE;

    PERFORM 1
    FROM public.accounts a
    WHERE a.id = v_old_account_id
      AND a.family_id = v_family_id
      AND a.is_active = true
    FOR UPDATE;

  END IF;


  -- =========================================================
  -- 8. VALIDASI SALDO TERSEDIA
  -- =========================================================
  --
  -- Untuk expense:
  --
  -- saldo aktual
  -- + reverse transaksi lama jika rekening sama
  -- - dana yang sudah dialokasikan ke Goal
  -- = saldo tersedia
  --
  -- Dana Goal TIDAK boleh digunakan.
  -- =========================================================

  IF p_type = 'expense' THEN

    -- -------------------------------------------------------
    -- 8A. Ambil saldo aktual rekening tujuan transaksi baru
    -- -------------------------------------------------------

    SELECT ab.balance
    INTO v_balance
    FROM public.account_balances ab
    WHERE ab.account_id = p_account_id
      AND ab.family_id = v_family_id;

    IF v_balance IS NULL THEN
      RAISE EXCEPTION
        'Saldo rekening tidak ditemukan.';
    END IF;


    -- -------------------------------------------------------
    -- 8B. Reverse efek transaksi lama
    -- -------------------------------------------------------
    --
    -- Hanya dilakukan jika transaksi lama dan transaksi baru
    -- menggunakan rekening yang sama.
    --
    -- Jika berbeda rekening, saldo rekening baru tidak
    -- terpengaruh transaksi lama.
    -- -------------------------------------------------------

    IF v_old_account_id = p_account_id THEN

      IF v_old_type = 'income' THEN
        v_balance := v_balance - v_old_amount;

      ELSIF v_old_type = 'expense' THEN
        v_balance := v_balance + v_old_amount;
      END IF;

    END IF;


    -- -------------------------------------------------------
    -- 8C. Hitung dana yang sudah dialokasikan ke Goal
    -- -------------------------------------------------------

    SELECT COALESCE(SUM(c.amount), 0)
    INTO v_allocated
    FROM public.financial_goal_contributions c
    WHERE c.account_id = p_account_id
      AND c.family_id = v_family_id;


    -- -------------------------------------------------------
    -- 8D. Hitung saldo tersedia
    -- -------------------------------------------------------

    v_available := v_balance - v_allocated;


    -- -------------------------------------------------------
    -- 8E. Pastikan transaksi baru tidak memakai dana Goal
    -- -------------------------------------------------------

    IF v_available < p_amount THEN
      RAISE EXCEPTION
        'Saldo tersedia tidak mencukupi untuk perubahan transaksi ini. Saldo tersedia: %.',
        v_available;
    END IF;

  END IF;


  -- =========================================================
  -- 9. UPDATE TRANSAKSI
  -- =========================================================

  UPDATE public.transactions
  SET
    account_id = p_account_id,
    category_id = p_category_id,
    type = p_type,
    amount = p_amount,
    transaction_date = p_transaction_date,
    description = NULLIF(TRIM(p_description), '')
  WHERE id = p_transaction_id
    AND family_id = v_family_id
    AND user_id = v_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'Transaksi gagal diperbarui.';
  END IF;


  -- =========================================================
  -- 10. RETURN ID
  -- =========================================================

  v_transaction_id := p_transaction_id;

  RETURN v_transaction_id;

END;
$$;


ALTER FUNCTION "public"."update_transaction"("p_transaction_id" "uuid", "p_account_id" "uuid", "p_category_id" "uuid", "p_type" "text", "p_amount" numeric, "p_transaction_date" "date", "p_description" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_transfer"("p_transfer_id" "uuid", "p_from_account_id" "uuid", "p_to_account_id" "uuid", "p_amount" numeric, "p_transfer_date" "date", "p_description" "text" DEFAULT NULL::"text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  v_user_id uuid;
  v_family_id uuid;
  v_transfer_id uuid;

  v_old_from_account_id uuid;
  v_old_to_account_id uuid;
  v_old_amount numeric;

  v_from_family_id uuid;
  v_to_family_id uuid;

  v_balance numeric;
  v_allocated numeric;
  v_available numeric;
BEGIN

  -- =========================================================
  -- 1. AUTH
  -- =========================================================

  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Sesi login tidak ditemukan.';
  END IF;


  -- =========================================================
  -- 2. VALIDASI INPUT
  -- =========================================================

  IF p_transfer_id IS NULL THEN
    RAISE EXCEPTION 'Transfer tidak ditemukan.';
  END IF;

  IF p_from_account_id IS NULL
     OR p_to_account_id IS NULL THEN
    RAISE EXCEPTION
      'Rekening sumber dan tujuan wajib dipilih.';
  END IF;

  IF p_from_account_id = p_to_account_id THEN
    RAISE EXCEPTION
      'Rekening sumber dan tujuan harus berbeda.';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION
      'Nominal transfer harus lebih dari 0.';
  END IF;

  IF p_transfer_date IS NULL THEN
    RAISE EXCEPTION
      'Tanggal transfer wajib diisi.';
  END IF;


  -- =========================================================
  -- 3. CARI FAMILY USER
  -- =========================================================

  SELECT fm.family_id
  INTO v_family_id
  FROM public.family_members fm
  WHERE fm.user_id = v_user_id
  LIMIT 1;

  IF v_family_id IS NULL THEN
    RAISE EXCEPTION
      'Keluarga user tidak ditemukan.';
  END IF;


  -- =========================================================
  -- 4. AMBIL TRANSFER LAMA
  -- =========================================================

  SELECT
    tr.from_account_id,
    tr.to_account_id,
    tr.amount
  INTO
    v_old_from_account_id,
    v_old_to_account_id,
    v_old_amount
  FROM public.transfers tr
  WHERE tr.id = p_transfer_id
    AND tr.family_id = v_family_id
    AND tr.user_id = v_user_id;

  IF v_old_from_account_id IS NULL THEN
    RAISE EXCEPTION
      'Transfer tidak ditemukan atau bukan milik Anda.';
  END IF;


  -- =========================================================
  -- 5. VALIDASI REKENING BARU
  -- =========================================================

  SELECT a.family_id
  INTO v_from_family_id
  FROM public.accounts a
  WHERE a.id = p_from_account_id
    AND a.is_active = true;

  IF v_from_family_id IS NULL THEN
    RAISE EXCEPTION
      'Rekening sumber tidak ditemukan atau tidak aktif.';
  END IF;


  SELECT a.family_id
  INTO v_to_family_id
  FROM public.accounts a
  WHERE a.id = p_to_account_id
    AND a.is_active = true;

  IF v_to_family_id IS NULL THEN
    RAISE EXCEPTION
      'Rekening tujuan tidak ditemukan atau tidak aktif.';
  END IF;


  IF v_from_family_id <> v_family_id THEN
    RAISE EXCEPTION
      'Rekening sumber bukan milik keluarga user.';
  END IF;

  IF v_to_family_id <> v_family_id THEN
    RAISE EXCEPTION
      'Rekening tujuan bukan milik keluarga user.';
  END IF;


  -- =========================================================
  -- 6. LOCK SEMUA REKENING YANG TERLIBAT
  -- =========================================================

  PERFORM 1
  FROM public.accounts a
  WHERE a.id IN (
    v_old_from_account_id,
    v_old_to_account_id,
    p_from_account_id,
    p_to_account_id
  )
    AND a.family_id = v_family_id
    AND a.is_active = true
  ORDER BY a.id
  FOR UPDATE;


  -- =========================================================
  -- 7. HITUNG SALDO EFEKTIF SOURCE
  -- =========================================================
  --
  -- Saldo saat ini masih mengandung efek transfer lama.
  -- Kita reverse efek tersebut terlebih dahulu.
  -- =========================================================

  SELECT ab.balance
  INTO v_balance
  FROM public.account_balances ab
  WHERE ab.account_id = p_from_account_id
    AND ab.family_id = v_family_id;

  IF v_balance IS NULL THEN
    RAISE EXCEPTION
      'Saldo rekening sumber tidak ditemukan.';
  END IF;


  -- Jika source baru = source lama,
  -- kembalikan nominal transfer lama.

  IF v_old_from_account_id = p_from_account_id THEN
    v_balance := v_balance + v_old_amount;
  END IF;


  -- Jika source baru = destination lama,
  -- transfer lama sebelumnya menambah saldo source.
  -- Reverse dengan mengurangi nominal lama.

  IF v_old_to_account_id = p_from_account_id THEN
    v_balance := v_balance - v_old_amount;
  END IF;


  -- =========================================================
  -- 8. HITUNG DANA GOAL PADA SOURCE BARU
  -- =========================================================

  SELECT COALESCE(SUM(c.amount), 0)
  INTO v_allocated
  FROM public.financial_goal_contributions c
  WHERE c.account_id = p_from_account_id
    AND c.family_id = v_family_id;


  -- =========================================================
  -- 9. HITUNG SALDO TERSEDIA
  -- =========================================================

  v_available := v_balance - v_allocated;


  -- =========================================================
  -- 10. VALIDASI SALDO TERSEDIA
  -- =========================================================

  IF v_available < p_amount THEN
    RAISE EXCEPTION
      'Saldo tersedia tidak mencukupi untuk perubahan transfer ini. Saldo tersedia: %.',
      v_available;
  END IF;


  -- =========================================================
  -- 11. UPDATE TRANSFER
  -- =========================================================

  UPDATE public.transfers
  SET
    from_account_id = p_from_account_id,
    to_account_id = p_to_account_id,
    amount = p_amount,
    transfer_date = p_transfer_date,
    description = NULLIF(TRIM(p_description), '')
  WHERE id = p_transfer_id
    AND family_id = v_family_id
    AND user_id = v_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'Transfer gagal diperbarui.';
  END IF;


  -- =========================================================
  -- 12. RETURN
  -- =========================================================

  v_transfer_id := p_transfer_id;

  RETURN v_transfer_id;

END;
$$;


ALTER FUNCTION "public"."update_transfer"("p_transfer_id" "uuid", "p_from_account_id" "uuid", "p_to_account_id" "uuid", "p_amount" numeric, "p_transfer_date" "date", "p_description" "text") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."accounts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "family_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "type" "text" NOT NULL,
    "initial_balance" numeric(15,2) DEFAULT 0 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "accounts_type_check" CHECK (("type" = ANY (ARRAY['bank'::"text", 'cash'::"text", 'e_wallet'::"text", 'investment'::"text", 'other'::"text"])))
);


ALTER TABLE "public"."accounts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."transactions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "family_id" "uuid" NOT NULL,
    "account_id" "uuid" NOT NULL,
    "category_id" "uuid",
    "user_id" "uuid" NOT NULL,
    "type" "text" NOT NULL,
    "amount" numeric(15,2) NOT NULL,
    "transaction_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "description" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "recurring_transaction_id" "uuid",
    CONSTRAINT "transactions_amount_check" CHECK (("amount" > (0)::numeric)),
    CONSTRAINT "transactions_type_check" CHECK (("type" = ANY (ARRAY['income'::"text", 'expense'::"text"])))
);


ALTER TABLE "public"."transactions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."transfers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "family_id" "uuid" NOT NULL,
    "from_account_id" "uuid" NOT NULL,
    "to_account_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "amount" numeric(15,2) NOT NULL,
    "transfer_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "description" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "transfers_amount_check" CHECK (("amount" > (0)::numeric)),
    CONSTRAINT "transfers_different_accounts" CHECK (("from_account_id" <> "to_account_id"))
);


ALTER TABLE "public"."transfers" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."account_balances" WITH ("security_invoker"='true') AS
 SELECT "id" AS "account_id",
    "family_id",
    "name" AS "account_name",
    "type" AS "account_type",
    "initial_balance",
    ((("initial_balance" + COALESCE(( SELECT "sum"(
                CASE
                    WHEN ("t"."type" = 'income'::"text") THEN "t"."amount"
                    WHEN ("t"."type" = 'expense'::"text") THEN (- "t"."amount")
                    ELSE (0)::numeric
                END) AS "sum"
           FROM "public"."transactions" "t"
          WHERE (("t"."account_id" = "a"."id") AND ("t"."family_id" = "a"."family_id"))), (0)::numeric)) - COALESCE(( SELECT "sum"("tr"."amount") AS "sum"
           FROM "public"."transfers" "tr"
          WHERE (("tr"."from_account_id" = "a"."id") AND ("tr"."family_id" = "a"."family_id"))), (0)::numeric)) + COALESCE(( SELECT "sum"("tr"."amount") AS "sum"
           FROM "public"."transfers" "tr"
          WHERE (("tr"."to_account_id" = "a"."id") AND ("tr"."family_id" = "a"."family_id"))), (0)::numeric)) AS "balance",
    "is_active"
   FROM "public"."accounts" "a";


ALTER VIEW "public"."account_balances" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."account_available_balances" WITH ("security_invoker"='true') AS
 SELECT "ab"."account_id",
    "ab"."family_id",
    "ab"."account_name",
    "ab"."account_type",
    "ab"."initial_balance",
    "ab"."balance",
    COALESCE("sum"("c"."amount"), (0)::numeric) AS "allocated_to_goals",
    ("ab"."balance" - COALESCE("sum"("c"."amount"), (0)::numeric)) AS "available_balance",
    "ab"."is_active"
   FROM ("public"."account_balances" "ab"
     LEFT JOIN "public"."financial_goal_contributions" "c" ON ((("c"."account_id" = "ab"."account_id") AND ("c"."family_id" = "ab"."family_id"))))
  GROUP BY "ab"."account_id", "ab"."family_id", "ab"."account_name", "ab"."account_type", "ab"."initial_balance", "ab"."balance", "ab"."is_active";


ALTER VIEW "public"."account_available_balances" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."budgets" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "family_id" "uuid" NOT NULL,
    "category_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "amount" numeric NOT NULL,
    "month" "date",
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "budgets_amount_positive" CHECK (("amount" > (0)::numeric)),
    CONSTRAINT "budgets_month_first_day" CHECK ((EXTRACT(day FROM "month") = (1)::numeric))
);


ALTER TABLE "public"."budgets" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."categories" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "family_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "type" "text" NOT NULL,
    "icon" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "categories_type_check" CHECK (("type" = ANY (ARRAY['income'::"text", 'expense'::"text"])))
);


ALTER TABLE "public"."categories" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."families" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."families" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."family_balance_summary" WITH ("security_invoker"='true') AS
 SELECT "family_id",
    COALESCE("sum"("balance"), (0)::numeric) AS "total_balance",
    "count"(*) FILTER (WHERE ("is_active" = true)) AS "active_accounts"
   FROM "public"."account_balances"
  GROUP BY "family_id";


ALTER VIEW "public"."family_balance_summary" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."family_members" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "family_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role" "text" DEFAULT 'member'::"text" NOT NULL,
    "joined_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "family_members_role_check" CHECK (("role" = ANY (ARRAY['owner'::"text", 'member'::"text"])))
);


ALTER TABLE "public"."family_members" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "full_name" "text",
    "avatar_url" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."recurring_transactions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "family_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "account_id" "uuid" NOT NULL,
    "category_id" "uuid" NOT NULL,
    "type" "text" NOT NULL,
    "amount" numeric NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "frequency" "text" NOT NULL,
    "next_date" "date" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."recurring_transactions" OWNER TO "postgres";


ALTER TABLE ONLY "public"."accounts"
    ADD CONSTRAINT "accounts_id_family_unique" UNIQUE ("id", "family_id");



ALTER TABLE ONLY "public"."accounts"
    ADD CONSTRAINT "accounts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."budgets"
    ADD CONSTRAINT "budgets_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."budgets"
    ADD CONSTRAINT "budgets_unique_category_month" UNIQUE ("family_id", "category_id", "month");



ALTER TABLE ONLY "public"."categories"
    ADD CONSTRAINT "categories_id_family_unique" UNIQUE ("id", "family_id");



ALTER TABLE ONLY "public"."categories"
    ADD CONSTRAINT "categories_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."categories"
    ADD CONSTRAINT "categories_unique_name" UNIQUE ("family_id", "name", "type");



ALTER TABLE ONLY "public"."families"
    ADD CONSTRAINT "families_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."family_members"
    ADD CONSTRAINT "family_members_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."family_members"
    ADD CONSTRAINT "family_members_unique" UNIQUE ("family_id", "user_id");



ALTER TABLE ONLY "public"."financial_goal_contributions"
    ADD CONSTRAINT "financial_goal_contributions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."financial_goals"
    ADD CONSTRAINT "financial_goals_id_family_unique" UNIQUE ("id", "family_id");



ALTER TABLE ONLY "public"."financial_goals"
    ADD CONSTRAINT "financial_goals_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."recurring_transactions"
    ADD CONSTRAINT "recurring_transactions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."transactions"
    ADD CONSTRAINT "transactions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."transfers"
    ADD CONSTRAINT "transfers_pkey" PRIMARY KEY ("id");



CREATE UNIQUE INDEX "budgets_one_active_recurring_per_category" ON "public"."budgets" USING "btree" ("family_id", "category_id") WHERE (("is_active" = true) AND ("month" IS NULL));



CREATE UNIQUE INDEX "budgets_recurring_unique" ON "public"."budgets" USING "btree" ("family_id", "category_id") WHERE (("month" IS NULL) AND ("is_active" = true));



CREATE INDEX "idx_accounts_family" ON "public"."accounts" USING "btree" ("family_id");



CREATE INDEX "idx_budgets_family_category" ON "public"."budgets" USING "btree" ("family_id", "category_id");



CREATE INDEX "idx_budgets_family_month" ON "public"."budgets" USING "btree" ("family_id", "month");



CREATE INDEX "idx_categories_family" ON "public"."categories" USING "btree" ("family_id");



CREATE INDEX "idx_transactions_account" ON "public"."transactions" USING "btree" ("account_id");



CREATE INDEX "idx_transactions_category" ON "public"."transactions" USING "btree" ("category_id");



CREATE INDEX "idx_transactions_family_date" ON "public"."transactions" USING "btree" ("family_id", "transaction_date" DESC);



CREATE UNIQUE INDEX "idx_transactions_recurring_date_unique" ON "public"."transactions" USING "btree" ("recurring_transaction_id", "transaction_date") WHERE ("recurring_transaction_id" IS NOT NULL);



CREATE INDEX "idx_transactions_recurring_transaction_id" ON "public"."transactions" USING "btree" ("recurring_transaction_id");



CREATE INDEX "idx_transfers_family_date" ON "public"."transfers" USING "btree" ("family_id", "transfer_date" DESC);



ALTER TABLE ONLY "public"."accounts"
    ADD CONSTRAINT "accounts_family_id_fkey" FOREIGN KEY ("family_id") REFERENCES "public"."families"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."budgets"
    ADD CONSTRAINT "budgets_category_family_fkey" FOREIGN KEY ("category_id", "family_id") REFERENCES "public"."categories"("id", "family_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."categories"
    ADD CONSTRAINT "categories_family_id_fkey" FOREIGN KEY ("family_id") REFERENCES "public"."families"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."families"
    ADD CONSTRAINT "families_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."family_members"
    ADD CONSTRAINT "family_members_family_id_fkey" FOREIGN KEY ("family_id") REFERENCES "public"."families"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."family_members"
    ADD CONSTRAINT "family_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."financial_goal_contributions"
    ADD CONSTRAINT "financial_goal_contributions_account_family_fkey" FOREIGN KEY ("account_id", "family_id") REFERENCES "public"."accounts"("id", "family_id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."financial_goal_contributions"
    ADD CONSTRAINT "financial_goal_contributions_goal_family_fkey" FOREIGN KEY ("goal_id", "family_id") REFERENCES "public"."financial_goals"("id", "family_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."financial_goal_contributions"
    ADD CONSTRAINT "financial_goal_contributions_goal_id_fkey" FOREIGN KEY ("goal_id") REFERENCES "public"."financial_goals"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."recurring_transactions"
    ADD CONSTRAINT "recurring_transactions_account_family_fkey" FOREIGN KEY ("account_id", "family_id") REFERENCES "public"."accounts"("id", "family_id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."recurring_transactions"
    ADD CONSTRAINT "recurring_transactions_category_family_fkey" FOREIGN KEY ("category_id", "family_id") REFERENCES "public"."categories"("id", "family_id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."transactions"
    ADD CONSTRAINT "transactions_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."transactions"
    ADD CONSTRAINT "transactions_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."transactions"
    ADD CONSTRAINT "transactions_family_id_fkey" FOREIGN KEY ("family_id") REFERENCES "public"."families"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."transactions"
    ADD CONSTRAINT "transactions_recurring_transaction_id_fkey" FOREIGN KEY ("recurring_transaction_id") REFERENCES "public"."recurring_transactions"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."transactions"
    ADD CONSTRAINT "transactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."transfers"
    ADD CONSTRAINT "transfers_family_id_fkey" FOREIGN KEY ("family_id") REFERENCES "public"."families"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."transfers"
    ADD CONSTRAINT "transfers_from_account_id_fkey" FOREIGN KEY ("from_account_id") REFERENCES "public"."accounts"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."transfers"
    ADD CONSTRAINT "transfers_to_account_id_fkey" FOREIGN KEY ("to_account_id") REFERENCES "public"."accounts"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."transfers"
    ADD CONSTRAINT "transfers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE RESTRICT;



CREATE POLICY "Members can create family accounts" ON "public"."accounts" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_family_member"("family_id"));



CREATE POLICY "Members can create family categories" ON "public"."categories" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_family_member"("family_id"));



CREATE POLICY "Members can create family transactions" ON "public"."transactions" FOR INSERT TO "authenticated" WITH CHECK (("public"."is_family_member"("family_id") AND ("user_id" = "auth"."uid"())));



CREATE POLICY "Members can create family transfers" ON "public"."transfers" FOR INSERT TO "authenticated" WITH CHECK (("public"."is_family_member"("family_id") AND ("user_id" = "auth"."uid"())));



CREATE POLICY "Members can delete family accounts" ON "public"."accounts" FOR DELETE TO "authenticated" USING ("public"."is_family_member"("family_id"));



CREATE POLICY "Members can delete family categories" ON "public"."categories" FOR DELETE TO "authenticated" USING ("public"."is_family_member"("family_id"));



CREATE POLICY "Members can update family accounts" ON "public"."accounts" FOR UPDATE TO "authenticated" USING ("public"."is_family_member"("family_id")) WITH CHECK ("public"."is_family_member"("family_id"));



CREATE POLICY "Members can update family categories" ON "public"."categories" FOR UPDATE TO "authenticated" USING ("public"."is_family_member"("family_id")) WITH CHECK ("public"."is_family_member"("family_id"));



CREATE POLICY "Members can view family accounts" ON "public"."accounts" FOR SELECT TO "authenticated" USING ("public"."is_family_member"("family_id"));



CREATE POLICY "Members can view family categories" ON "public"."categories" FOR SELECT TO "authenticated" USING ("public"."is_family_member"("family_id"));



CREATE POLICY "Members can view family members" ON "public"."family_members" FOR SELECT TO "authenticated" USING ("public"."is_family_member"("family_id"));



CREATE POLICY "Members can view family transactions" ON "public"."transactions" FOR SELECT TO "authenticated" USING ("public"."is_family_member"("family_id"));



CREATE POLICY "Members can view family transfers" ON "public"."transfers" FOR SELECT TO "authenticated" USING ("public"."is_family_member"("family_id"));



CREATE POLICY "Members can view their family" ON "public"."families" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."family_members"
  WHERE (("family_members"."family_id" = "families"."id") AND ("family_members"."user_id" = "auth"."uid"())))));



CREATE POLICY "Owners can update their family" ON "public"."families" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."family_members"
  WHERE (("family_members"."family_id" = "families"."id") AND ("family_members"."user_id" = "auth"."uid"()) AND ("family_members"."role" = 'owner'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."family_members"
  WHERE (("family_members"."family_id" = "families"."id") AND ("family_members"."user_id" = "auth"."uid"()) AND ("family_members"."role" = 'owner'::"text")))));



CREATE POLICY "Users can create their own family" ON "public"."families" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "created_by"));



CREATE POLICY "Users can delete family financial goals" ON "public"."financial_goals" FOR DELETE USING (("family_id" IN ( SELECT "family_members"."family_id"
   FROM "public"."family_members"
  WHERE ("family_members"."user_id" = "auth"."uid"()))));



CREATE POLICY "Users can delete family goal contributions" ON "public"."financial_goal_contributions" FOR DELETE USING (("family_id" IN ( SELECT "family_members"."family_id"
   FROM "public"."family_members"
  WHERE ("family_members"."user_id" = "auth"."uid"()))));



CREATE POLICY "Users can delete their own transactions" ON "public"."transactions" FOR DELETE TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can insert family financial goals" ON "public"."financial_goals" FOR INSERT WITH CHECK ((("family_id" IN ( SELECT "family_members"."family_id"
   FROM "public"."family_members"
  WHERE ("family_members"."user_id" = "auth"."uid"()))) AND ("user_id" = "auth"."uid"())));



CREATE POLICY "Users can insert family goal contributions" ON "public"."financial_goal_contributions" FOR INSERT WITH CHECK ((("family_id" IN ( SELECT "family_members"."family_id"
   FROM "public"."family_members"
  WHERE ("family_members"."user_id" = "auth"."uid"()))) AND ("user_id" = "auth"."uid"())));



CREATE POLICY "Users can insert their own profile" ON "public"."profiles" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "id"));



CREATE POLICY "Users can update family financial goals" ON "public"."financial_goals" FOR UPDATE USING (("family_id" IN ( SELECT "fm"."family_id"
   FROM "public"."family_members" "fm"
  WHERE ("fm"."user_id" = "auth"."uid"())))) WITH CHECK ((("family_id" IN ( SELECT "fm"."family_id"
   FROM "public"."family_members" "fm"
  WHERE ("fm"."user_id" = "auth"."uid"()))) AND ("user_id" = "auth"."uid"())));



CREATE POLICY "Users can update their own profile" ON "public"."profiles" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "id")) WITH CHECK (("auth"."uid"() = "id"));



CREATE POLICY "Users can update their own transactions" ON "public"."transactions" FOR UPDATE TO "authenticated" USING (("user_id" = "auth"."uid"())) WITH CHECK ((("user_id" = "auth"."uid"()) AND "public"."is_family_member"("family_id")));



CREATE POLICY "Users can view family financial goals" ON "public"."financial_goals" FOR SELECT USING (("family_id" IN ( SELECT "family_members"."family_id"
   FROM "public"."family_members"
  WHERE ("family_members"."user_id" = "auth"."uid"()))));



CREATE POLICY "Users can view family goal contributions" ON "public"."financial_goal_contributions" FOR SELECT USING (("family_id" IN ( SELECT "family_members"."family_id"
   FROM "public"."family_members"
  WHERE ("family_members"."user_id" = "auth"."uid"()))));



CREATE POLICY "Users can view their own profile" ON "public"."profiles" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "id"));



ALTER TABLE "public"."accounts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."budgets" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."categories" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."families" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "family members can delete budgets" ON "public"."budgets" FOR DELETE USING (("family_id" IN ( SELECT "family_members"."family_id"
   FROM "public"."family_members"
  WHERE ("family_members"."user_id" = "auth"."uid"()))));



CREATE POLICY "family members can delete recurring transactions" ON "public"."recurring_transactions" FOR DELETE TO "authenticated" USING (("family_id" IN ( SELECT "family_members"."family_id"
   FROM "public"."family_members"
  WHERE ("family_members"."user_id" = "auth"."uid"()))));



CREATE POLICY "family members can insert budgets" ON "public"."budgets" FOR INSERT WITH CHECK ((("family_id" IN ( SELECT "family_members"."family_id"
   FROM "public"."family_members"
  WHERE ("family_members"."user_id" = "auth"."uid"()))) AND ("user_id" = "auth"."uid"())));



CREATE POLICY "family members can insert recurring transactions" ON "public"."recurring_transactions" FOR INSERT TO "authenticated" WITH CHECK (("family_id" IN ( SELECT "family_members"."family_id"
   FROM "public"."family_members"
  WHERE ("family_members"."user_id" = "auth"."uid"()))));



CREATE POLICY "family members can update budgets" ON "public"."budgets" FOR UPDATE USING (("family_id" IN ( SELECT "family_members"."family_id"
   FROM "public"."family_members"
  WHERE ("family_members"."user_id" = "auth"."uid"())))) WITH CHECK (("family_id" IN ( SELECT "family_members"."family_id"
   FROM "public"."family_members"
  WHERE ("family_members"."user_id" = "auth"."uid"()))));



CREATE POLICY "family members can update recurring transactions" ON "public"."recurring_transactions" FOR UPDATE TO "authenticated" USING (("family_id" IN ( SELECT "family_members"."family_id"
   FROM "public"."family_members"
  WHERE ("family_members"."user_id" = "auth"."uid"())))) WITH CHECK (("family_id" IN ( SELECT "family_members"."family_id"
   FROM "public"."family_members"
  WHERE ("family_members"."user_id" = "auth"."uid"()))));



CREATE POLICY "family members can view budgets" ON "public"."budgets" FOR SELECT USING (("family_id" IN ( SELECT "family_members"."family_id"
   FROM "public"."family_members"
  WHERE ("family_members"."user_id" = "auth"."uid"()))));



CREATE POLICY "family members can view recurring transactions" ON "public"."recurring_transactions" FOR SELECT TO "authenticated" USING (("family_id" IN ( SELECT "family_members"."family_id"
   FROM "public"."family_members"
  WHERE ("family_members"."user_id" = "auth"."uid"()))));



ALTER TABLE "public"."family_members" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."financial_goal_contributions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."financial_goals" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."recurring_transactions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."transactions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."transfers" ENABLE ROW LEVEL SECURITY;


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT SELECT,MAINTAIN ON TABLE "public"."financial_goal_contributions" TO "authenticated";
GRANT ALL ON TABLE "public"."financial_goal_contributions" TO "service_role";



REVOKE ALL ON FUNCTION "public"."add_goal_contribution"("p_goal_id" "uuid", "p_account_id" "uuid", "p_amount" numeric, "p_contribution_date" "date", "p_description" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."add_goal_contribution"("p_goal_id" "uuid", "p_account_id" "uuid", "p_amount" numeric, "p_contribution_date" "date", "p_description" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."add_goal_contribution"("p_goal_id" "uuid", "p_account_id" "uuid", "p_amount" numeric, "p_contribution_date" "date", "p_description" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_transaction"("p_account_id" "uuid", "p_category_id" "uuid", "p_type" "text", "p_amount" numeric, "p_transaction_date" "date", "p_description" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_transaction"("p_account_id" "uuid", "p_category_id" "uuid", "p_type" "text", "p_amount" numeric, "p_transaction_date" "date", "p_description" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_transaction"("p_account_id" "uuid", "p_category_id" "uuid", "p_type" "text", "p_amount" numeric, "p_transaction_date" "date", "p_description" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_transfer"("p_from_account_id" "uuid", "p_to_account_id" "uuid", "p_amount" numeric, "p_transfer_date" "date", "p_description" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_transfer"("p_from_account_id" "uuid", "p_to_account_id" "uuid", "p_amount" numeric, "p_transfer_date" "date", "p_description" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_transfer"("p_from_account_id" "uuid", "p_to_account_id" "uuid", "p_amount" numeric, "p_transfer_date" "date", "p_description" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."delete_financial_goal"("p_goal_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."delete_financial_goal"("p_goal_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."delete_financial_goal"("p_goal_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."delete_goal_contribution"("p_contribution_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."delete_goal_contribution"("p_contribution_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."delete_goal_contribution"("p_contribution_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."delete_transfer"("p_transfer_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."delete_transfer"("p_transfer_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."delete_transfer"("p_transfer_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_family_dashboard"("target_family_id" "uuid", "target_month" "date") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_family_dashboard"("target_family_id" "uuid", "target_month" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_family_dashboard"("target_family_id" "uuid", "target_month" "date") TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_family_member"("target_family_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_family_member"("target_family_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_family_member"("target_family_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."process_recurring_transaction"("p_recurring_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."process_recurring_transaction"("p_recurring_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."process_recurring_transaction"("p_recurring_id" "uuid") TO "service_role";



GRANT SELECT,INSERT,DELETE,MAINTAIN ON TABLE "public"."financial_goals" TO "authenticated";
GRANT ALL ON TABLE "public"."financial_goals" TO "service_role";



REVOKE ALL ON FUNCTION "public"."update_financial_goal"("p_goal_id" "uuid", "p_name" "text", "p_description" "text", "p_target_amount" numeric, "p_deadline" "date") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."update_financial_goal"("p_goal_id" "uuid", "p_name" "text", "p_description" "text", "p_target_amount" numeric, "p_deadline" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_financial_goal"("p_goal_id" "uuid", "p_name" "text", "p_description" "text", "p_target_amount" numeric, "p_deadline" "date") TO "service_role";



REVOKE ALL ON FUNCTION "public"."update_transaction"("p_transaction_id" "uuid", "p_account_id" "uuid", "p_category_id" "uuid", "p_type" "text", "p_amount" numeric, "p_transaction_date" "date", "p_description" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."update_transaction"("p_transaction_id" "uuid", "p_account_id" "uuid", "p_category_id" "uuid", "p_type" "text", "p_amount" numeric, "p_transaction_date" "date", "p_description" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_transaction"("p_transaction_id" "uuid", "p_account_id" "uuid", "p_category_id" "uuid", "p_type" "text", "p_amount" numeric, "p_transaction_date" "date", "p_description" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."update_transfer"("p_transfer_id" "uuid", "p_from_account_id" "uuid", "p_to_account_id" "uuid", "p_amount" numeric, "p_transfer_date" "date", "p_description" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."update_transfer"("p_transfer_id" "uuid", "p_from_account_id" "uuid", "p_to_account_id" "uuid", "p_amount" numeric, "p_transfer_date" "date", "p_description" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_transfer"("p_transfer_id" "uuid", "p_from_account_id" "uuid", "p_to_account_id" "uuid", "p_amount" numeric, "p_transfer_date" "date", "p_description" "text") TO "service_role";



GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."accounts" TO "authenticated";
GRANT ALL ON TABLE "public"."accounts" TO "service_role";



GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."transactions" TO "authenticated";
GRANT ALL ON TABLE "public"."transactions" TO "service_role";



GRANT SELECT,INSERT,MAINTAIN ON TABLE "public"."transfers" TO "authenticated";
GRANT ALL ON TABLE "public"."transfers" TO "service_role";



GRANT ALL ON TABLE "public"."account_balances" TO "service_role";
GRANT SELECT ON TABLE "public"."account_balances" TO "authenticated";



GRANT ALL ON TABLE "public"."account_available_balances" TO "service_role";
GRANT SELECT ON TABLE "public"."account_available_balances" TO "authenticated";



GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."budgets" TO "authenticated";
GRANT ALL ON TABLE "public"."budgets" TO "service_role";



GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."categories" TO "authenticated";
GRANT ALL ON TABLE "public"."categories" TO "service_role";



GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."families" TO "authenticated";
GRANT ALL ON TABLE "public"."families" TO "service_role";



GRANT ALL ON TABLE "public"."family_balance_summary" TO "service_role";
GRANT SELECT ON TABLE "public"."family_balance_summary" TO "authenticated";



GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."family_members" TO "authenticated";
GRANT ALL ON TABLE "public"."family_members" TO "service_role";



GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."recurring_transactions" TO "authenticated";
GRANT ALL ON TABLE "public"."recurring_transactions" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";







