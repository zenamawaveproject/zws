export async function onRequest(context) {
  const { request, env } = context;

  if (!env.ZWS_DB) {
    return json({
      success: false,
      error: "D1 binding ZWS_DB belum tersedia."
    }, 500);
  }

  const url = new URL(request.url);
  const action = url.searchParams.get("action") || "home";

  try {
    if (request.method === "GET") {
      return await handleGet(action, url, env);
    }

    if (request.method === "POST") {
      return await handlePost(action, request, env);
    }

    if (request.method === "PUT") {
      return await handlePut(action, request, env);
    }

    if (request.method === "DELETE") {
      return await handleDelete(action, url, env);
    }

    return json({
      success: false,
      error: "Method tidak didukung."
    }, 405);

  } catch (error) {
    console.error("ZWS CMS API ERROR:", error);

    return json({
      success: false,
      error: "Terjadi kesalahan pada server.",
      message: error.message
    }, 500);
  }
}


/* ==================================================
   GET
================================================== */

async function handleGet(action, url, env) {

  const db = env.ZWS_DB;

  /* -----------------------------------------------
     HOME
  ------------------------------------------------ */

  if (action === "home") {

    const settings = await db
      .prepare(`
        SELECT *
        FROM site_settings
        WHERE id = 1
        LIMIT 1
      `)
      .first();

    const seo = await db
      .prepare(`
        SELECT *
        FROM seo_settings
        WHERE id = 1
        LIMIT 1
      `)
      .first();

    const contact = await db
      .prepare(`
        SELECT *
        FROM contact_settings
        WHERE id = 1
        LIMIT 1
      `)
      .first();

    const navigation = await db
      .prepare(`
        SELECT *
        FROM navigation_items
        WHERE is_visible = 1
        ORDER BY sort_order ASC, id ASC
      `)
      .all();

    const page = await db
      .prepare(`
        SELECT *
        FROM pages
        WHERE slug = ?
        LIMIT 1
      `)
      .bind("/")
      .first();

    let sections = [];

    if (page) {

      const sectionResult = await db
        .prepare(`
          SELECT *
          FROM page_sections
          WHERE page_id = ?
          AND is_visible = 1
          ORDER BY sort_order ASC, id ASC
        `)
        .bind(page.id)
        .all();

      sections = sectionResult.results || [];

      for (const section of sections) {

        const itemResult = await db
          .prepare(`
            SELECT *
            FROM section_items
            WHERE section_id = ?
            AND is_visible = 1
            ORDER BY sort_order ASC, id ASC
          `)
          .bind(section.id)
          .all();

        section.items = itemResult.results || [];

        if (section.settings_json) {
          try {
            section.settings =
              JSON.parse(section.settings_json);
          } catch {
            section.settings = {};
          }
        } else {
          section.settings = {};
        }
      }
    }

    return json({
      success: true,
      data: {
        settings: settings || {},
        seo: seo || {},
        contact: contact || {},
        navigation: navigation.results || [],
        page: page || null,
        sections
      }
    });
  }


  /* -----------------------------------------------
     SETTINGS
  ------------------------------------------------ */

  if (action === "settings") {

    const data = await db
      .prepare(`
        SELECT *
        FROM site_settings
        WHERE id = 1
        LIMIT 1
      `)
      .first();

    return json({
      success: true,
      data: data || {}
    });
  }


  /* -----------------------------------------------
     NAVIGATION
  ------------------------------------------------ */

  if (action === "navigation") {

    const data = await db
      .prepare(`
        SELECT *
        FROM navigation_items
        ORDER BY sort_order ASC, id ASC
      `)
      .all();

    return json({
      success: true,
      data: data.results || []
    });
  }


  /* -----------------------------------------------
     PAGES
  ------------------------------------------------ */

  if (action === "pages") {

    const slug = url.searchParams.get("slug");

    if (slug) {

      const page = await db
        .prepare(`
          SELECT *
          FROM pages
          WHERE slug = ?
          LIMIT 1
        `)
        .bind(slug)
        .first();

      if (!page) {
        return json({
          success: false,
          error: "Halaman tidak ditemukan."
        }, 404);
      }

      const sections = await db
        .prepare(`
          SELECT *
          FROM page_sections
          WHERE page_id = ?
          ORDER BY sort_order ASC, id ASC
        `)
        .bind(page.id)
        .all();

      const result = sections.results || [];

      for (const section of result) {

        const items = await db
          .prepare(`
            SELECT *
            FROM section_items
            WHERE section_id = ?
            ORDER BY sort_order ASC, id ASC
          `)
          .bind(section.id)
          .all();

        section.items = items.results || [];
      }

      page.sections = result;

      return json({
        success: true,
        data: page
      });
    }

    const pages = await db
      .prepare(`
        SELECT *
        FROM pages
        ORDER BY id DESC
      `)
      .all();

    return json({
      success: true,
      data: pages.results || []
    });
  }


  /* -----------------------------------------------
     SECTIONS
  ------------------------------------------------ */

  if (action === "sections") {

    const pageId = url.searchParams.get("page_id");

    if (!pageId) {
      return json({
        success: false,
        error: "page_id wajib diisi."
      }, 400);
    }

    const sections = await db
      .prepare(`
        SELECT *
        FROM page_sections
        WHERE page_id = ?
        ORDER BY sort_order ASC, id ASC
      `)
      .bind(pageId)
      .all();

    return json({
      success: true,
      data: sections.results || []
    });
  }


  /* -----------------------------------------------
     ITEMS
  ------------------------------------------------ */

  if (action === "items") {

    const sectionId = url.searchParams.get("section_id");

    if (!sectionId) {
      return json({
        success: false,
        error: "section_id wajib diisi."
      }, 400);
    }

    const items = await db
      .prepare(`
        SELECT *
        FROM section_items
        WHERE section_id = ?
        ORDER BY sort_order ASC, id ASC
      `)
      .bind(sectionId)
      .all();

    return json({
      success: true,
      data: items.results || []
    });
  }


  /* -----------------------------------------------
     MEDIA
  ------------------------------------------------ */

  if (action === "media") {

    const folder = url.searchParams.get("folder");

    let result;

    if (folder) {

      result = await db
        .prepare(`
          SELECT *
          FROM media
          WHERE folder = ?
          ORDER BY id DESC
        `)
        .bind(folder)
        .all();

    } else {

      result = await db
        .prepare(`
          SELECT *
          FROM media
          ORDER BY id DESC
        `)
        .all();

    }

    return json({
      success: true,
      data: result.results || []
    });
  }


  /* -----------------------------------------------
     SEO
  ------------------------------------------------ */

  if (action === "seo") {

    const data = await db
      .prepare(`
        SELECT *
        FROM seo_settings
        WHERE id = 1
        LIMIT 1
      `)
      .first();

    return json({
      success: true,
      data: data || {}
    });
  }


  /* -----------------------------------------------
     CONTACT
  ------------------------------------------------ */

  if (action === "contact") {

    const data = await db
      .prepare(`
        SELECT *
        FROM contact_settings
        WHERE id = 1
        LIMIT 1
      `)
      .first();

    return json({
      success: true,
      data: data || {}
    });
  }


  /* -----------------------------------------------
     ADMIN USERS
  ------------------------------------------------ */

  if (action === "users") {

    const users = await db
      .prepare(`
        SELECT
          id,
          username,
          display_name,
          role,
          is_active,
          created_at,
          updated_at
        FROM admin_users
        ORDER BY id DESC
      `)
      .all();

    return json({
      success: true,
      data: users.results || []
    });
  }


  return json({
    success: false,
    error: "Action tidak dikenal.",
    action
  }, 400);
}


/* ==================================================
   POST
================================================== */

async function handlePost(action, request, env) {

  const db = env.ZWS_DB;
  const body = await request.json();


  /* -----------------------------------------------
     SETTINGS
  ------------------------------------------------ */

  if (action === "settings") {

    await db
      .prepare(`
        INSERT INTO site_settings (
          id,
          site_name,
          site_title,
          tagline,
          description,
          logo_url,
          favicon_url,
          primary_color,
          secondary_color,
          contact_email,
          contact_phone,
          whatsapp,
          address,
          copyright_text,
          updated_at
        )
        VALUES (
          1,
          ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP
        )
        ON CONFLICT(id)
        DO UPDATE SET
          site_name = excluded.site_name,
          site_title = excluded.site_title,
          tagline = excluded.tagline,
          description = excluded.description,
          logo_url = excluded.logo_url,
          favicon_url = excluded.favicon_url,
          primary_color = excluded.primary_color,
          secondary_color = excluded.secondary_color,
          contact_email = excluded.contact_email,
          contact_phone = excluded.contact_phone,
          whatsapp = excluded.whatsapp,
          address = excluded.address,
          copyright_text = excluded.copyright_text,
          updated_at = CURRENT_TIMESTAMP
      `)
      .bind(
        body.site_name || "",
        body.site_title || "",
        body.tagline || "",
        body.description || "",
        body.logo_url || "",
        body.favicon_url || "",
        body.primary_color || "#1463d6",
        body.secondary_color || "#ffffff",
        body.contact_email || "",
        body.contact_phone || "",
        body.whatsapp || "",
        body.address || "",
        body.copyright_text || ""
      )
      .run();

    return json({
      success: true,
      message: "Pengaturan website berhasil disimpan."
    });
  }


  /* -----------------------------------------------
     NAVIGATION
  ------------------------------------------------ */

  if (action === "navigation") {

    const result = await db
      .prepare(`
        INSERT INTO navigation_items (
          label,
          url,
          target,
          sort_order,
          is_visible
        )
        VALUES (?, ?, ?, ?, ?)
      `)
      .bind(
        body.label || "",
        body.url || "#",
        body.target || "_self",
        Number(body.sort_order || 0),
        Number(body.is_visible ?? 1)
      )
      .run();

    return json({
      success: true,
      message: "Menu berhasil ditambahkan.",
      id: result.meta.last_row_id
    });
  }


  /* -----------------------------------------------
     PAGE
  ------------------------------------------------ */

  if (action === "page") {

    const result = await db
      .prepare(`
        INSERT INTO pages (
          title,
          slug,
          status,
          template,
          meta_title,
          meta_description,
          canonical_url,
          og_title,
          og_description,
          og_image
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .bind(
        body.title || "",
        body.slug || "",
        body.status || "draft",
        body.template || "landing",
        body.meta_title || "",
        body.meta_description || "",
        body.canonical_url || "",
        body.og_title || "",
        body.og_description || "",
        body.og_image || ""
      )
      .run();

    return json({
      success: true,
      message: "Halaman berhasil dibuat.",
      id: result.meta.last_row_id
    });
  }


  /* -----------------------------------------------
     SECTION
  ------------------------------------------------ */

  if (action === "section") {

    if (!body.page_id) {
      return json({
        success: false,
        error: "page_id wajib diisi."
      }, 400);
    }

    const result = await db
      .prepare(`
        INSERT INTO page_sections (
          page_id,
          section_key,
          section_type,
          title,
          subtitle,
          content,
          settings_json,
          sort_order,
          is_visible
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .bind(
        Number(body.page_id),
        body.section_key || "",
        body.section_type || "content",
        body.title || "",
        body.subtitle || "",
        body.content || "",
        typeof body.settings_json === "string"
          ? body.settings_json
          : JSON.stringify(body.settings_json || {}),
        Number(body.sort_order || 0),
        Number(body.is_visible ?? 1)
      )
      .run();

    return json({
      success: true,
      message: "Section berhasil dibuat.",
      id: result.meta.last_row_id
    });
  }


  /* -----------------------------------------------
     ITEM
  ------------------------------------------------ */

  if (action === "item") {

    if (!body.section_id) {
      return json({
        success: false,
        error: "section_id wajib diisi."
      }, 400);
    }

    const result = await db
      .prepare(`
        INSERT INTO section_items (
          section_id,
          item_key,
          title,
          subtitle,
          description,
          icon,
          image_url,
          url,
          settings_json,
          sort_order,
          is_visible
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .bind(
        Number(body.section_id),
        body.item_key || "",
        body.title || "",
        body.subtitle || "",
        body.description || "",
        body.icon || "",
        body.image_url || "",
        body.url || "",
        typeof body.settings_json === "string"
          ? body.settings_json
          : JSON.stringify(body.settings_json || {}),
        Number(body.sort_order || 0),
        Number(body.is_visible ?? 1)
      )
      .run();

    return json({
      success: true,
      message: "Item berhasil dibuat.",
      id: result.meta.last_row_id
    });
  }


  /* -----------------------------------------------
     SEO
  ------------------------------------------------ */

  if (action === "seo") {

    await db
      .prepare(`
        INSERT INTO seo_settings (
          id,
          meta_title,
          meta_description,
          keywords,
          canonical_url,
          og_title,
          og_description,
          og_image,
          robots,
          updated_at
        )
        VALUES (
          1,
          ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP
        )
        ON CONFLICT(id)
        DO UPDATE SET
          meta_title = excluded.meta_title,
          meta_description = excluded.meta_description,
          keywords = excluded.keywords,
          canonical_url = excluded.canonical_url,
          og_title = excluded.og_title,
          og_description = excluded.og_description,
          og_image = excluded.og_image,
          robots = excluded.robots,
          updated_at = CURRENT_TIMESTAMP
      `)
      .bind(
        body.meta_title || "",
        body.meta_description || "",
        body.keywords || "",
        body.canonical_url || "",
        body.og_title || "",
        body.og_description || "",
        body.og_image || "",
        body.robots || "index,follow"
      )
      .run();

    return json({
      success: true,
      message: "SEO berhasil disimpan."
    });
  }


  /* -----------------------------------------------
     CONTACT
  ------------------------------------------------ */

  if (action === "contact") {

    await db
      .prepare(`
        INSERT INTO contact_settings (
          id,
          email,
          whatsapp,
          phone,
          instagram,
          facebook,
          linkedin,
          website,
          updated_at
        )
        VALUES (
          1,
          ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP
        )
        ON CONFLICT(id)
        DO UPDATE SET
          email = excluded.email,
          whatsapp = excluded.whatsapp,
          phone = excluded.phone,
          instagram = excluded.instagram,
          facebook = excluded.facebook,
          linkedin = excluded.linkedin,
          website = excluded.website,
          updated_at = CURRENT_TIMESTAMP
      `)
      .bind(
        body.email || "",
        body.whatsapp || "",
        body.phone || "",
        body.instagram || "",
        body.facebook || "",
        body.linkedin || "",
        body.website || ""
      )
      .run();

    return json({
      success: true,
      message: "Kontak berhasil disimpan."
    });
  }


  return json({
    success: false,
    error: "Action POST tidak dikenal.",
    action
  }, 400);
}


/* ==================================================
   PUT
================================================== */

async function handlePut(action, request, env) {

  const db = env.ZWS_DB;
  const body = await request.json();

  if (!body.id) {
    return json({
      success: false,
      error: "ID wajib diisi."
    }, 400);
  }


  /* -----------------------------------------------
     NAVIGATION
  ------------------------------------------------ */

  if (action === "navigation") {

    await db
      .prepare(`
        UPDATE navigation_items
        SET
          label = ?,
          url = ?,
          target = ?,
          sort_order = ?,
          is_visible = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `)
      .bind(
        body.label || "",
        body.url || "#",
        body.target || "_self",
        Number(body.sort_order || 0),
        Number(body.is_visible ?? 1),
        Number(body.id)
      )
      .run();

    return json({
      success: true,
      message: "Menu berhasil diperbarui."
    });
  }


  /* -----------------------------------------------
     PAGE
  ------------------------------------------------ */

  if (action === "page") {

    await db
      .prepare(`
        UPDATE pages
        SET
          title = ?,
          slug = ?,
          status = ?,
          template = ?,
          meta_title = ?,
          meta_description = ?,
          canonical_url = ?,
          og_title = ?,
          og_description = ?,
          og_image = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `)
      .bind(
        body.title || "",
        body.slug || "",
        body.status || "draft",
        body.template || "landing",
        body.meta_title || "",
        body.meta_description || "",
        body.canonical_url || "",
        body.og_title || "",
        body.og_description || "",
        body.og_image || "",
        Number(body.id)
      )
      .run();

    return json({
      success: true,
      message: "Halaman berhasil diperbarui."
    });
  }


  /* -----------------------------------------------
     SECTION
  ------------------------------------------------ */

  if (action === "section") {

    await db
      .prepare(`
        UPDATE page_sections
        SET
          section_key = ?,
          section_type = ?,
          title = ?,
          subtitle = ?,
          content = ?,
          settings_json = ?,
          sort_order = ?,
          is_visible = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `)
      .bind(
        body.section_key || "",
        body.section_type || "content",
        body.title || "",
        body.subtitle || "",
        body.content || "",
        typeof body.settings_json === "string"
          ? body.settings_json
          : JSON.stringify(body.settings_json || {}),
        Number(body.sort_order || 0),
        Number(body.is_visible ?? 1),
        Number(body.id)
      )
      .run();

    return json({
      success: true,
      message: "Section berhasil diperbarui."
    });
  }


  /* -----------------------------------------------
     ITEM
  ------------------------------------------------ */

  if (action === "item") {

    await db
      .prepare(`
        UPDATE section_items
        SET
          item_key = ?,
          title = ?,
          subtitle = ?,
          description = ?,
          icon = ?,
          image_url = ?,
          url = ?,
          settings_json = ?,
          sort_order = ?,
          is_visible = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `)
      .bind(
        body.item_key || "",
        body.title || "",
        body.subtitle || "",
        body.description || "",
        body.icon || "",
        body.image_url || "",
        body.url || "",
        typeof body.settings_json === "string"
          ? body.settings_json
          : JSON.stringify(body.settings_json || {}),
        Number(body.sort_order || 0),
        Number(body.is_visible ?? 1),
        Number(body.id)
      )
      .run();

    return json({
      success: true,
      message: "Item berhasil diperbarui."
    });
  }


  return json({
    success: false,
    error: "Action PUT tidak dikenal.",
    action
  }, 400);
}


/* ==================================================
   DELETE
================================================== */

async function handleDelete(action, url, env) {

  const db = env.ZWS_DB;
  const id = url.searchParams.get("id");

  if (!id) {
    return json({
      success: false,
      error: "ID wajib diisi."
    }, 400);
  }


  if (action === "navigation") {

    await db
      .prepare(`
        DELETE FROM navigation_items
        WHERE id = ?
      `)
      .bind(Number(id))
      .run();

    return json({
      success: true,
      message: "Menu berhasil dihapus."
    });
  }


  if (action === "page") {

    await db
      .prepare(`
        DELETE FROM pages
        WHERE id = ?
      `)
      .bind(Number(id))
      .run();

    return json({
      success: true,
      message: "Halaman berhasil dihapus."
    });
  }


  if (action === "section") {

    await db
      .prepare(`
        DELETE FROM page_sections
        WHERE id = ?
      `)
      .bind(Number(id))
      .run();

    return json({
      success: true,
      message: "Section berhasil dihapus."
    });
  }


  if (action === "item") {

    await db
      .prepare(`
        DELETE FROM section_items
        WHERE id = ?
      `)
      .bind(Number(id))
      .run();

    return json({
      success: true,
      message: "Item berhasil dihapus."
    });
  }


  if (action === "media") {

    await db
      .prepare(`
        DELETE FROM media
        WHERE id = ?
      `)
      .bind(Number(id))
      .run();

    return json({
      success: true,
      message: "Data media berhasil dihapus."
    });
  }


  return json({
    success: false,
    error: "Action DELETE tidak dikenal.",
    action
  }, 400);
}


/* ==================================================
   JSON RESPONSE
================================================== */

function json(data,status=200){

  return new Response(
    JSON.stringify(data,null,2),
    {
      status,
      headers:{
        "Content-Type":"application/json; charset=UTF-8",
        "Cache-Control":"no-store",
        "Access-Control-Allow-Origin":"*"
      }
    }
  );

}
