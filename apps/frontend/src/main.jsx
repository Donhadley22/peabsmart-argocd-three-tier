import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';

function App() {
  const [tasks, setTasks] = useState([]);
  const [title, setTitle] = useState('');
  const [version, setVersion] = useState('loading');
  const [error, setError] = useState('');

  async function request(path, options) {
    const response = await fetch(path, options);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Request failed');
    return data;
  }
  async function refresh() {
    const [rows, info] = await Promise.all([
      request('/api/tasks'), request('/api/version')
    ]);
    setTasks(rows);
    setVersion(info.version);
    setError('');
  }
  useEffect(() => { refresh().catch(e => setError(e.message)); }, []);

  async function add(event) {
    event.preventDefault();
    try {
      await request('/api/tasks', {
        method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({title})
      });
      setTitle('');
      await refresh();
    } catch (e) { setError(e.message); }
  }
  async function remove(id) {
    try {
      await request(`/api/tasks/${id}`, {method: 'DELETE'});
      await refresh();
    } catch (e) { setError(e.message); }
  }
  return <main>
    <h1>Peabsmart Academy Task Tracker</h1>
    <p>GitOps with Argo CD | API {version}</p>
    <form onSubmit={add}>
      <input aria-label="Task title" value={title} maxLength={120}
        onChange={e => setTitle(e.target.value)} required />
      <button type="submit">Add task</button>
    </form>
    {error && <p role="alert" className="error">{error}</p>}
    <ul>{tasks.map(task => <li key={task.id}>
      {task.title} <button onClick={() => remove(task.id)}>Delete</button>
    </li>)}</ul>
    <button onClick={() => refresh().catch(e => setError(e.message))}>
      Refresh
    </button>
    <p><small>React | Node.js | PostgreSQL</small></p>
  </main>;
}
createRoot(document.getElementById('root')).render(<App />);
