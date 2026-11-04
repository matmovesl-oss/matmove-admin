import { requireAdmin, failure } from '../server/admin-auth.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const INTEREST_STATUSES = new Set(['new', 'contacted', 'in_progress', 'completed', 'cancelled']);

function parseBody(body) {
  if (typeof body !== 'string') return body || {};
  try { return JSON.parse(body); }
  catch { throw failure(400, 'Invalid Concierge request body.'); }
}

function slugify(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function serviceSnapshot(row) {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    category: row.category,
    description: row.description,
    price_label: row.price_label,
    is_active: row.is_active,
    display_order: row.display_order,
    deleted_at: row.deleted_at,
  };
}

function assertManager(access) {
  if (access?.is_active !== true || access?.is_owner !== true &&
      !(Array.isArray(access?.permissions) && access.permissions.includes('special'))) {
    throw failure(403, 'Concierge management requires the active Special Operations assignment.');
  }
}

export function createHandler({ authorize = requireAdmin, now = () => new Date().toISOString() } = {}) {
  return async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Vary', 'Authorization');

    if (!['GET', 'POST'].includes(req.method)) {
      res.setHeader('Allow', 'GET, POST');
      return res.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
      const { client, user, access } = await authorize(req, ['special'], {});
      assertManager(access);

      if (req.method === 'GET') {
        const [serviceResult, interestResult] = await Promise.all([
          client.from('concierge_services').select('*').order('display_order').order('title'),
          client.from('concierge_interests').select(
            'id,service_id,service_slug,service_title,price_label_snapshot,customer_id,customer_name,customer_email,customer_phone,message,status,created_at,updated_at'
          ).order('created_at', { ascending: false }).limit(500),
        ]);
        if (serviceResult.error) throw failure(503, 'Concierge catalogue could not be loaded.');
        if (interestResult.error) throw failure(503, 'Concierge enquiry history could not be loaded.');
        return res.status(200).json({
          services: serviceResult.data || [],
          interests: interestResult.data || [],
          generatedAt: now(),
        });
      }

      const body = parseBody(req.body);
      if (!body || typeof body !== 'object' || Array.isArray(body) ||
          typeof body.action !== 'string') {
        throw failure(400, 'Choose a valid Concierge action.');
      }

      if (body.action === 'save') {
        const allowed = new Set(['action', 'id', 'slug', 'title', 'category', 'description', 'priceLabel', 'displayOrder']);
        if (Object.keys(body).some(key => !allowed.has(key))) throw failure(400, 'Unexpected Concierge service fields.');
        const title = String(body.title || '').trim();
        const category = String(body.category || '').trim();
        const description = String(body.description || '').trim();
        const priceLabel = String(body.priceLabel || '').trim();
        const slug = slugify(body.slug || title);
        const displayOrder = Number(body.displayOrder);
        if (body.id != null && !UUID.test(String(body.id))) throw failure(400, 'Invalid Concierge service ID.');
        if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 100 ||
            title.length < 2 || title.length > 120 ||
            category.length < 2 || category.length > 60 ||
            description.length > 1000 ||
            priceLabel.length < 1 || priceLabel.length > 120 ||
            !Number.isInteger(displayOrder) || displayOrder < 0 || displayOrder > 10000) {
          throw failure(400, 'Enter a valid service name, category, description, display price, and display order.');
        }

        const values = {
          slug, title, category, description, price_label: priceLabel,
          display_order: displayOrder, updated_by: user.id, updated_at: now(),
        };
        let before = null;
        let saved;
        if (body.id) {
          const current = await client.from('concierge_services').select('*').eq('id', body.id).maybeSingle();
          if (current.error) throw failure(503, 'The selected Concierge service could not be loaded.');
          if (!current.data || current.data.deleted_at) throw failure(404, 'The Concierge service was not found or has been deleted.');
          before = serviceSnapshot(current.data);
          const update = await client.from('concierge_services').update(values).eq('id', body.id).select('*').single();
          if (update.error) {
            if (update.error.code === '23505') throw failure(409, 'Another Concierge service already uses this service link.');
            throw failure(503, 'Concierge service changes could not be saved.');
          }
          saved = update.data;
        } else {
          const insert = await client.from('concierge_services').insert({
            ...values, is_active: true, created_by: user.id,
          }).select('*').single();
          if (insert.error) {
            if (insert.error.code === '23505') throw failure(409, 'Another Concierge service already uses this service link.');
            throw failure(503, 'The new Concierge service could not be created.');
          }
          saved = insert.data;
        }

        const audit = await client.from('concierge_service_audit').insert({
          service_id: saved.id,
          actor_id: user.id,
          action: before ? 'updated' : 'created',
          before_data: before,
          after_data: serviceSnapshot(saved),
        });
        if (audit.error) {
          return res.status(503).json({
            error: 'The service was saved, but its audit event could not be written. Check the Concierge audit table before repeating the change.',
            saved: true,
            serviceId: saved.id,
          });
        }
        return res.status(200).json({ success: true, service: saved });
      }

      if (body.action === 'archive' || body.action === 'restore' || body.action === 'set-active') {
        const allowed = new Set(['action', 'id', 'active']);
        if (Object.keys(body).some(key => !allowed.has(key)) || !UUID.test(String(body.id || ''))) {
          throw failure(400, 'A valid Concierge service ID is required.');
        }
        if (body.action === 'set-active' && typeof body.active !== 'boolean') {
          throw failure(400, 'Choose whether the Concierge service should be active.');
        }
        const current = await client.from('concierge_services').select('*').eq('id', body.id).maybeSingle();
        if (current.error) throw failure(503, 'The selected Concierge service could not be loaded.');
        if (!current.data) throw failure(404, 'Concierge service not found.');
        const before = serviceSnapshot(current.data);
        const timestamp = now();
        const values = body.action === 'archive'
          ? { is_active: false, deleted_at: timestamp, updated_by: user.id, updated_at: timestamp }
          : body.action === 'restore'
            ? { is_active: true, deleted_at: null, updated_by: user.id, updated_at: timestamp }
            : { is_active: body.active, updated_by: user.id, updated_at: timestamp };
        const update = await client.from('concierge_services').update(values).eq('id', body.id).select('*').single();
        if (update.error) throw failure(503, 'Concierge service status could not be changed.');
        const action = body.action === 'archive' ? 'deactivated' : body.action === 'restore' ? 'restored' : 'updated';
        const audit = await client.from('concierge_service_audit').insert({
          service_id: body.id,
          actor_id: user.id,
          action,
          before_data: before,
          after_data: serviceSnapshot(update.data),
        });
        if (audit.error) {
          return res.status(503).json({
            error: 'The service status changed, but its audit event could not be written. Check the Concierge audit table.',
            saved: true,
            serviceId: body.id,
          });
        }
        return res.status(200).json({ success: true, service: update.data });
      }

      if (body.action === 'set-interest-status') {
        const allowed = new Set(['action', 'id', 'status']);
        if (Object.keys(body).some(key => !allowed.has(key)) ||
            !UUID.test(String(body.id || '')) || !INTEREST_STATUSES.has(body.status)) {
          throw failure(400, 'Choose a valid enquiry and status.');
        }
        const update = await client.from('concierge_interests')
          .update({ status: body.status, updated_at: now() })
          .eq('id', body.id)
          .select('id,status,updated_at')
          .single();
        if (update.error) throw failure(503, 'Concierge enquiry status could not be updated.');
        return res.status(200).json({ success: true, interest: update.data });
      }

      throw failure(400, 'Unknown Concierge action.');
    } catch (error) {
      return res.status(error.status || 500).json({
        error: error.status ? error.message : 'Concierge request failed.',
      });
    }
  };
}

export default createHandler();