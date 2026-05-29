import { NextResponse } from 'next/server'
import { createClient, createServiceRoleClient } from '@/lib/supabase/server'

export async function DELETE() {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorised. Please log in first.' }, { status: 401 })
    }

    const adminClient = createServiceRoleClient()

    // 1. Fetch all product IDs belonging to this store.
    //    We need these to delete purchases that reference them BEFORE deleting
    //    the products — purchases.product_id has ON DELETE RESTRICT so the
    //    products can't be deleted while any purchase row still points at them.
    const { data: productRows } = await adminClient
      .from('products')
      .select('id')
      .eq('user_id', user.id)

    const productIds = (productRows ?? []).map((r: { id: string }) => r.id)

    // 2. Delete purchases that reference this store's products.
    //    This breaks the RESTRICT constraint that would otherwise block product deletion.
    //    (Purchase records referencing the seller user_id are handled by the auth
    //    cascade, but product_id must be cleared manually first.)
    if (productIds.length > 0) {
      const { error: purchasesError } = await adminClient
        .from('purchases')
        .delete()
        .in('product_id', productIds)

      if (purchasesError) {
        console.error('Error deleting purchases:', purchasesError)
        return NextResponse.json(
          { error: `Failed to clear purchase records: ${purchasesError.message}` },
          { status: 500 }
        )
      }
    }

    // 3. Delete all marketplace products (removes them from the marketplace view).
    //    canonical_products are NOT touched — they are shared global records.
    if (productIds.length > 0) {
      const { error: productsError } = await adminClient
        .from('products')
        .delete()
        .eq('user_id', user.id)

      if (productsError) {
        console.error('Error deleting products:', productsError)
        return NextResponse.json(
          { error: `Failed to remove products: ${productsError.message}` },
          { status: 500 }
        )
      }
    }

    // 4. Null out product_images.uploaded_by — this FK has no ON DELETE CASCADE,
    //    so deleteUser() would be blocked if we don't clear it first.
    //    The images themselves are preserved (they're shared canonical data).
    const { error: imagesError } = await adminClient
      .from('product_images')
      .update({ uploaded_by: null })
      .eq('uploaded_by', user.id)

    if (imagesError) {
      console.error('Error nulling product_images.uploaded_by:', imagesError)
      return NextResponse.json(
        { error: `Failed to unlink product images: ${imagesError.message}` },
        { status: 500 }
      )
    }

    // 6. Remove logo from storage
    const { data: logoFiles } = await adminClient.storage
      .from('logo')
      .list(user.id)

    if (logoFiles && logoFiles.length > 0) {
      const paths = logoFiles.map((f: { name: string }) => `${user.id}/${f.name}`)
      await adminClient.storage.from('logo').remove(paths)
    }

    // 7. Delete the auth user — cascades to: users, lightspeed_tokens,
    //    stripe_connect_accounts, conversations, messages, notifications, offers,
    //    follows, vouchers, genie_conversations, etc.
    const { error: deleteUserError } = await adminClient.auth.admin.deleteUser(user.id)

    if (deleteUserError) {
      console.error('Error deleting auth user:', deleteUserError)
      return NextResponse.json(
        { error: `Failed to delete account: ${deleteUserError.message}` },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Unexpected error during account deletion:', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: `An unexpected error occurred: ${message}` }, { status: 500 })
  }
}
