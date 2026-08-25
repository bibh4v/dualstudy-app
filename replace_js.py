import io

path = r'C:\Users\Acer\deploy-ready\public\index.html'
with io.open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# Find the start and end markers
start_marker = '/* ============ API HELPERS ============ */'
end_marker = '''  saving=false;
  if(pendingSave){pendingSave=false;doSave();}
}'''

start_idx = content.index(start_marker)
end_idx = content.index(end_marker) + len(end_marker)

old_block = content[start_idx:end_idx]

new_block = '''/* ============ LOCALSTORAGE MIGRATION (one-time) ============ */
async function migrateLocalStorage() {
  const legacyKeys = [
    'plannerState', 'plannerSlots', 'plannerNotes', 'plannerTasks',
    'plannerMscSubjects', 'plannerNeaTech', 'plannerNeaNonTech',
    'plannerGoals', 'plannerFocusMin', 'plannerFocusDate'
  ];

  const hasLegacy = legacyKeys.some(k => localStorage.getItem(k));
  if (!hasLegacy || localStorage.getItem('migrated')) return;

  console.log('Migrating legacy localStorage data to Supabase...');

  try {
    // Load legacy data
    const state = JSON.parse(localStorage.getItem('plannerState') || '{}');
    const slots = JSON.parse(localStorage.getItem('plannerSlots') || '[]');
    const notes = JSON.parse(localStorage.getItem('plannerNotes') || '[]');
    const tasks = JSON.parse(localStorage.getItem('plannerTasks') || '[]');
    const mscSubjects = JSON.parse(localStorage.getItem('plannerMscSubjects') || '[]');
    const neaTech = JSON.parse(localStorage.getItem('plannerNeaTech') || '[]');
    const neaNonTech = JSON.parse(localStorage.getItem('plannerNeaNonTech') || '[]');
    const goals = JSON.parse(localStorage.getItem('plannerGoals') || '[]');
    const focusMin = parseInt(localStorage.getItem('plannerFocusMin') || '0', 10);
    const focusDate = localStorage.getItem('plannerFocusDate') || '';

    // Get user ID once
    const { data: { user } } = await sb.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    // Migrate settings
    if (Object.keys(state).length > 0) {
      const { error } = await sb
        .from('planner_state')
        .upsert({
          user_id: user.id,
          day_end: state.dayEnd || '22:00',
          nea_fixed: state.neaFixed || 120,
          nea_start: state.neaStart || '20:00',
          focus_min: focusMin,
          focus_date: focusDate
        });
      if (error) console.error('Settings migration error:', error);
    }

    // Migrate slots
    for (const slot of slots) {
      const { error } = await sb.from('slots').insert({
        user_id: user.id,
        label: slot.label,
        type: slot.type,
        start_time: slot.start,
        duration: slot.dur
      });
      if (error) console.error('Slot migration error:', error);
    }

    // Migrate notes (including file uploads for Base64 data URLs)
    for (const note of notes) {
      let fileData = null;
      if (note.file && note.file.url && note.file.url.startsWith('data:')) {
        const blob = await (await fetch(note.file.url)).blob();
        const fileName = Date.now() + '-' + note.file.name;
        const { data, error: uploadError } = await sb.storage
          .from('note-attachments')
          .upload(fileName, blob, { contentType: note.file.type });

        if (!uploadError && data) {
          const { data: { publicUrl } } = sb.storage.from('note-attachments').getPublicUrl(data.path);
          fileData = { url: publicUrl, name: note.file.name, type: note.file.type, size: note.file.size };
        }
      } else if (note.file && note.file.url) {
        fileData = note.file;
      }

      const { error } = await sb.from('notes').insert({
        user_id: user.id,
        title: note.title,
        cat: note.cat,
        body: note.body || '',
        file_url: fileData && fileData.url,
        file_name: fileData && fileData.name,
        file_type: fileData && fileData.type,
        file_size: fileData && fileData.size,
        date: note.date
      });
      if (error) console.error('Note migration error:', error);
    }

    // Migrate MSc subjects
    for (const subj of mscSubjects) {
      let fileData = null;
      if (subj.file && subj.file.url && subj.file.url.startsWith('data:')) {
        const blob = await (await fetch(subj.file.url)).blob();
        const fileName = Date.now() + '-' + subj.file.name;
        const { data, error: uploadError } = await sb.storage
          .from('note-attachments')
          .upload(fileName, blob, { contentType: subj.file.type });

        if (!uploadError && data) {
          const { data: { publicUrl } } = sb.storage.from('note-attachments').getPublicUrl(data.path);
          fileData = { url: publicUrl, name: subj.file.name, type: subj.file.type, size: subj.file.size };
        }
      } else if (subj.file && subj.file.url) {
        fileData = subj.file;
      }

      const { data: subjectData, error: subjError } = await sb
        .from('msc_subjects')
        .insert({
          user_id: user.id,
          name: subj.name,
          pct: subj.pct || 0,
          file_url: fileData && fileData.url,
          file_name: fileData && fileData.name,
          file_type: fileData && fileData.type,
          file_size: fileData && fileData.size
        })
        .select()
        .single();

      if (!subjError && subjectData && subj.subtopics) {
        for (const st of subj.subtopics) {
          await sb.from('msc_subtopics').insert({
            subject_id: subjectData.id,
            name: st.name,
            total: st.total || 1,
            done: st.done || 0
          });
        }
      }
    }

    // Migrate NEA Technical
    for (const topic of neaTech) {
      let fileData = null;
      if (topic.file && topic.file.url && topic.file.url.startsWith('data:')) {
        const blob = await (await fetch(topic.file.url)).blob();
        const fileName = Date.now() + '-' + topic.file.name;
        const { data, error: uploadError } = await sb.storage
          .from('note-attachments')
          .upload(fileName, blob, { contentType: topic.file.type });

        if (!uploadError && data) {
          const { data: { publicUrl } } = sb.storage.from('note-attachments').getPublicUrl(data.path);
          fileData = { url: publicUrl, name: topic.file.name, type: topic.file.type, size: topic.file.size };
        }
      } else if (topic.file && topic.file.url) {
        fileData = topic.file;
      }

      const { data: topicData, error: topicError } = await sb
        .from('nea_tech')
        .insert({
          user_id: user.id,
          name: topic.name,
          pct: topic.pct || 0,
          file_url: fileData && fileData.url,
          file_name: fileData && fileData.name,
          file_type: fileData && fileData.type,
          file_size: fileData && fileData.size
        })
        .select()
        .single();

      if (!topicError && topicData && topic.subtopics) {
        for (const st of topic.subtopics) {
          await sb.from('nea_tech_subtopics').insert({
            topic_id: topicData.id,
            name: st.name,
            total: st.total || 1,
            done: st.done || 0
          });
        }
      }
    }

    // Migrate NEA Non-Technical
    for (const topic of neaNonTech) {
      let fileData = null;
      if (topic.file && topic.file.url && topic.file.url.startsWith('data:')) {
        const blob = await (await fetch(topic.file.url)).blob();
        const fileName = Date.now() + '-' + topic.file.name;
        const { data, error: uploadError } = await sb.storage
          .from('note-attachments')
          .upload(fileName, blob, { contentType: topic.file.type });

        if (!uploadError && data) {
          const { data: { publicUrl } } = sb.storage.from('note-attachments').getPublicUrl(data.path);
          fileData = { url: publicUrl, name: topic.file.name, type: topic.file.type, size: topic.file.size };
        }
      } else if (topic.file && topic.file.url) {
        fileData = topic.file;
      }

      const { data: topicData, error: topicError } = await sb
        .from('nea_nontech')
        .insert({
          user_id: user.id,
          name: topic.name,
          pct: topic.pct || 0,
          file_url: fileData && fileData.url,
          file_name: fileData && fileData.name,
          file_type: fileData && fileData.type,
          file_size: fileData && fileData.size
        })
        .select()
        .single();

      if (!topicError && topicData && topic.subtopics) {
        for (const st of topic.subtopics) {
          await sb.from('nea_nontech_subtopics').insert({
            topic_id: topicData.id,
            name: st.name,
            total: st.total || 1,
            done: st.done || 0
          });
        }
      }
    }

    // Migrate goals
    for (const goal of goals) {
      const { error } = await sb.from('goals').insert({
        user_id: user.id,
        title: goal.title,
        description: goal.desc || '',
        track: goal.track,
        pct: goal.pct || 0
      });
      if (error) console.error('Goal migration error:', error);
    }

    // Migrate tasks
    for (const task of tasks) {
      const { data: taskData, error: taskError } = await sb
        .from('tasks')
        .insert({
          user_id: user.id,
          name: task.name,
          track: task.track,
          dead: task.dead,
          window: task.window || '',
          status: task.status || 'todo',
          total: task.total || 1,
          done: task.done || 0
        })
        .select()
        .single();

      if (!taskError && taskData && task.subtopics) {
        for (const st of task.subtopics) {
          await sb.from('task_subtopics').insert({
            task_id: taskData.id,
            name: st.name,
            total: st.total || 1,
            done: st.done || 0
          });
        }
      }
    }

    // Mark migration complete
    localStorage.setItem('migrated', 'true');
    console.log('Migration complete!');
  } catch (e) {
    console.error('Migration failed:', e);
  }
}

/* ============ SUPABASE DATA OPERATIONS ============ */
async function loadState() {
  const { data: { user } } = await sb.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  // Load all data in parallel
  const [
    { data: stateData },
    { data: slotsData },
    { data: mscSubjectsData },
    { data: neaTechData },
    { data: neaNonTechData },
    { data: notesData },
    { data: tasksData },
    { data: goalsData }
  ] = await Promise.all([
    sb.from('planner_state').select('*').eq('user_id', user.id).single(),
    sb.from('slots').select('*').eq('user_id', user.id).order('start_time'),
    sb.from('msc_subjects').select('*, msc_subtopics(*)').eq('user_id', user.id),
    sb.from('nea_tech').select('*, nea_tech_subtopics(*)').eq('user_id', user.id),
    sb.from('nea_nontech').select('*, nea_nontech_subtopics(*)').eq('user_id', user.id),
    sb.from('notes').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
    sb.from('tasks').select('*, task_subtopics(*)').eq('user_id', user.id).order('created_at', { ascending: false }),
    sb.from('goals').select('*').eq('user_id', user.id).order('created_at', { ascending: false })
  ]);

  // Map to frontend state format
  if (stateData) {
    S.dayEnd = stateData.day_end;
    S.neaFixed = stateData.nea_fixed;
    S.neaStart = stateData.nea_start;
    S.focusMin = stateData.focus_min || 0;
    S.focusDate = stateData.focus_date || '';
  }

  S.slots = (slotsData || []).map(s => ({
    id: s.id,
    label: s.label,
    type: s.type,
    start: s.start_time,
    dur: s.duration
  }));

  S.mscSubjects = (mscSubjectsData || []).map(s => ({
    id: s.id,
    name: s.name,
    pct: s.pct,
    file: s.file_url ? { url: s.file_url, name: s.file_name, type: s.file_type, size: s.file_size } : null,
    subtopics: (s.msc_subtopics || []).map(st => ({
      id: st.id,
      name: st.name,
      total: st.total,
      done: st.done
    }))
  }));

  S.neaTech = (neaTechData || []).map(t => ({
    id: t.id,
    name: t.name,
    pct: t.pct,
    file: t.file_url ? { url: t.file_url, name: t.file_name, type: t.file_type, size: t.file_size } : null,
    subtopics: (t.nea_tech_subtopics || []).map(st => ({
      id: st.id,
      name: st.name,
      total: st.total,
      done: st.done
    }))
  }));

  S.neaNonTech = (neaNonTechData || []).map(t => ({
    id: t.id,
    name: t.name,
    pct: t.pct,
    file: t.file_url ? { url: t.file_url, name: t.file_name, type: t.file_type, size: t.file_size } : null,
    subtopics: (t.nea_nontech_subtopics || []).map(st => ({
      id: st.id,
      name: st.name,
      total: st.total,
      done: st.done
    }))
  }));

  S.notes = (notesData || []).map(n => ({
    id: n.id,
    title: n.title,
    cat: n.cat,
    body: n.body,
    file: n.file_url ? { url: n.file_url, name: n.file_name, type: n.file_type, size: n.file_size } : null,
    date: n.date
  }));

  S.tasks = (tasksData || []).map(t => ({
    id: t.id,
    name: t.name,
    track: t.track,
    dead: t.dead,
    window: t.window,
    status: t.status,
    total: t.total,
    done: t.done,
    subtopics: (t.task_subtopics || []).map(st => ({
      id: st.id,
      name: st.name,
      total: st.total,
      done: st.done
    }))
  }));

  S.goals = (goalsData || []).map(g => ({
    id: g.id,
    title: g.title,
    desc: g.description,
    track: g.track,
    pct: g.pct
  }));
}

async function saveState() {
  const { data: { user } } = await sb.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  // Save planner settings
  const { error: stateError } = await sb.from('planner_state').upsert({
    user_id: user.id,
    day_end: S.dayEnd,
    nea_fixed: S.neaFixed,
    nea_start: S.neaStart,
    focus_min: S.focusMin,
    focus_date: S.focusDate
  });
  if (stateError) throw stateError;

  // Save slots (delete and re-insert for simplicity)
  await sb.from('slots').delete().eq('user_id', user.id);
  if (S.slots.length) {
    const { error: slotsError } = await sb.from('slots').insert(
      S.slots.map(s => ({
        user_id: user.id,
        label: s.label,
        type: s.type,
        start_time: s.start,
        duration: s.dur
      }))
    );
    if (slotsError) throw slotsError;
  }

  // Save MSc subjects
  for (const s of S.mscSubjects) {
    const { data: subjData, error: subjError } = await sb
      .from('msc_subjects')
      .upsert({
        id: s.id,
        user_id: user.id,
        name: s.name,
        pct: s.pct,
        file_url: s.file && s.file.url,
        file_name: s.file && s.file.name,
        file_type: s.file && s.file.type,
        file_size: s.file && s.file.size
      })
      .select()
      .single();
    if (subjError) throw subjError;

    if (s.subtopics && s.subtopics.length) {
      await sb.from('msc_subtopics').delete().eq('subject_id', subjData.id);
      const { error: subError } = await sb.from('msc_subtopics').insert(
        s.subtopics.map(st => ({
          subject_id: subjData.id,
          name: st.name,
          total: st.total,
          done: st.done
        }))
      );
      if (subError) throw subError;
    }
  }

  // Save NEA Technical
  for (const t of S.neaTech) {
    const { data: topicData, error: topicError } = await sb
      .from('nea_tech')
      .upsert({
        id: t.id,
        user_id: user.id,
        name: t.name,
        pct: t.pct,
        file_url: t.file && t.file.url,
        file_name: t.file && t.file.name,
        file_type: t.file && t.file.type,
        file_size: t.file && t.file.size
      })
      .select()
      .single();
    if (topicError) throw topicError;

    if (t.subtopics && t.subtopics.length) {
      await sb.from('nea_tech_subtopics').delete().eq('topic_id', topicData.id);
      const { error: subError } = await sb.from('nea_tech_subtopics').insert(
        t.subtopics.map(st => ({
          topic_id: topicData.id,
          name: st.name,
          total: st.total,
          done: st.done
        }))
      );
      if (subError) throw subError;
    }
  }

  // Save NEA Non-Technical
  for (const t of S.neaNonTech) {
    const { data: topicData, error: topicError } = await sb
      .from('nea_nontech')
      .upsert({
        id: t.id,
        user_id: user.id,
        name: t.name,
        pct: t.pct,
        file_url: t.file && t.file.url,
        file_name: t.file && t.file.name,
        file_type: t.file && t.file.type,
        file_size: t.file && t.file.size
      })
      .select()
      .single();
    if (topicError) throw topicError;

    if (t.subtopics && t.subtopics.length) {
      await sb.from('nea_nontech_subtopics').delete().eq('topic_id', topicData.id);
      const { error: subError } = await sb.from('nea_nontech_subtopics').insert(
        t.subtopics.map(st => ({
          topic_id: topicData.id,
          name: st.name,
          total: st.total,
          done: st.done
        }))
      );
      if (subError) throw subError;
    }
  }

  // Save notes
  for (const n of S.notes) {
    const { error } = await sb.from('notes').upsert({
      id: n.id,
      user_id: user.id,
      title: n.title,
      cat: n.cat,
      body: n.body,
      file_url: n.file && n.file.url,
      file_name: n.file && n.file.name,
      file_type: n.file && n.file.type,
      file_size: n.file && n.file.size,
      date: n.date
    });
    if (error) throw error;
  }

  // Save tasks
  for (const t of S.tasks) {
    const { data: taskData, error: taskError } = await sb
      .from('tasks')
      .upsert({
        id: t.id,
        user_id: user.id,
        name: t.name,
        track: t.track,
        dead: t.dead,
        window: t.window,
        status: t.status,
        total: t.total,
        done: t.done
      })
      .select()
      .single();
    if (taskError) throw taskError;

    if (t.subtopics && t.subtopics.length) {
      await sb.from('task_subtopics').delete().eq('task_id', taskData.id);
      const { error: subError } = await sb.from('task_subtopics').insert(
        t.subtopics.map(st => ({
          task_id: taskData.id,
          name: st.name,
          total: st.total,
          done: st.done
        }))
      );
      if (subError) throw subError;
    }
  }

  // Save goals
  for (const g of S.goals) {
    const { error } = await sb.from('goals').upsert({
      id: g.id,
      user_id: user.id,
      title: g.title,
      description: g.desc,
      track: g.track,
      pct: g.pct
    });
    if (error) throw error;
  }
}

async function uploadFile(file) {
  const { data: { user } } = await sb.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const fileName = user.id + '/' + Date.now() + '-' + file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
  const { data, error } = await sb.storage
    .from('note-attachments')
    .upload(fileName, file, { contentType: file.type });

  if (error) throw error;

  const { data: { publicUrl } } = sb.storage.from('note-attachments').getPublicUrl(data.path);
  return { url: publicUrl, name: file.name, type: file.type, size: file.size };
}

async function deleteFile(fileUrl) {
  if (!fileUrl) return;
  // Extract path from public URL
  const url = new URL(fileUrl);
  const pathParts = url.pathname.split('/note-attachments/');
  if (pathParts.length < 2) return;
  const filePath = pathParts[1];
  await sb.storage.from('note-attachments').remove([filePath]);
}

function setSyncStatus(status, text) {
  const dot = document.getElementById('syncDot');
  const txt = document.getElementById('syncText');
  dot.style.background = status === 'ok' ? 'var(--good)' : status === 'syncing' ? 'var(--warn)' : 'var(--crit)';
  txt.textContent = text;
}

/* Debounced autosave: any mutation ends with render(), which queues a save */
let autoSave = false;           // enabled after initial load
let saveTimer = null, saving = false, pendingSave = false;
function queueSave() {
  if (!autoSave) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(doSave, 600);
}
async function doSave() {
  if (saving) { pendingSave = true; return; }
  saving = true;
  setSyncStatus('syncing', 'Saving...');
  try {
    await saveState();
    setSyncStatus('ok', 'Synced');
  } catch (e) {
    setSyncStatus('err', 'Save failed');
    toast(e.message || 'Failed to save');
  }
  saving = false;
  if (pendingSave) { pendingSave = false; doSave(); }
}'''

content = content[:start_idx] + new_block + content[end_idx:]
with io.open(path, 'w', encoding='utf-8') as f:
    f.write(content)
print('Done. Old block length:', len(old_block), 'New block length:', len(new_block))