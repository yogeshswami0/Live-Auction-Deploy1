import React, { useEffect, useState, useCallback } from "react";
import axios from "axios";
import io from "socket.io-client";
import "./schedule.css";
import { BACKEND_URL } from "../../config";

const Schedule = () => {
  const user = JSON.parse(localStorage.getItem("user") || "null");
  const token = localStorage.getItem("token");
  const isAdmin = user?.role === "Admin";

  const [events, setEvents] = useState([]);
  const [activeEvent, setActiveEvent] = useState(null);
  const [selectedEventId, setSelectedEventId] = useState(null);
  const [teams, setTeams] = useState([]);
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [venue, setVenue] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [generating, setGenerating] = useState(false);
  const [tournamentType, setTournamentType] = useState("league");
  const [knockoutCount, setKnockoutCount] = useState(4);
  const [editingMatchId, setEditingMatchId] = useState(null);
  const [editFormData, setEditFormData] = useState({ venue: "", date: "", timeSlot: "" });
  const [socket] = useState(() => io(BACKEND_URL, { auth: { token } }));

  const eventId = selectedEventId || activeEvent?._id;

  const fetchEvents = useCallback(async () => {
    try {
      let list = [];
      if (isAdmin && token) {
        const res = await axios.get(`${BACKEND_URL}/api/events`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        list = Array.isArray(res.data) ? res.data : [];
      } else {
        const res = await axios.get(`${BACKEND_URL}/api/events/active`);
        list = Array.isArray(res.data) ? res.data : [];
      }
      setEvents(list);
      const active = list.find((e) => e.isActive) || list[0];
      setActiveEvent(active || null);
      if (!selectedEventId && active) setSelectedEventId(active._id);
    } catch (err) {
      console.error("Error fetching events", err);
      setEvents([]);
    }
  }, [selectedEventId, isAdmin, token]);

  const fetchTeams = useCallback(async (eid) => {
    if (!eid) return setTeams([]);
    try {
      const res = await axios.get(`${BACKEND_URL}/api/events/${eid}/teams`);
      setTeams(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error("Error fetching teams", err);
      setTeams([]);
    }
  }, []);

  const fetchMatches = useCallback(async (eid) => {
    if (!eid) return setMatches([]);
    try {
      const res = await axios.get(`${BACKEND_URL}/api/schedule/${eid}`);
      setMatches(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error("Error fetching schedule", err);
      setMatches([]);
    }
  }, []);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  useEffect(() => {
    if (!eventId) {
      setTeams([]);
      setMatches([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    Promise.all([fetchTeams(eventId), fetchMatches(eventId)]).finally(() =>
      setLoading(false)
    );
  }, [eventId, fetchTeams, fetchMatches]);

  useEffect(() => {
    socket.on("schedule:refresh", (id) => {
      if (id === eventId) fetchMatches(eventId);
    });
    return () => socket.off("schedule:refresh");
  }, [eventId, fetchMatches, socket]);

  const deleteMatch = async (matchId) => {
    if (!window.confirm("Are you sure you want to delete this match?")) return;
    try {
      await axios.delete(`${BACKEND_URL}/api/schedule/${matchId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      socket.emit("schedule:update", eventId);
      await fetchMatches(eventId);
    } catch (err) {
      alert("Failed to delete match");
    }
  };

  const startEdit = (match) => {
    setEditingMatchId(match._id);
    setEditFormData({
      venue: match.venue,
      date: match.startTime ? new Date(match.startTime).toISOString().split("T")[0] : "",
      timeSlot: match.timeSlot,
    });
  };

  const cancelEdit = () => {
    setEditingMatchId(null);
    setEditFormData({ venue: "", date: "", timeSlot: "" });
  };

  const saveEdit = async (matchId) => {
    try {
      await axios.put(
        `${BACKEND_URL}/api/schedule/${matchId}`,
        editFormData,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setEditingMatchId(null);
      socket.emit("schedule:update", eventId);
      await fetchMatches(eventId);
    } catch (err) {
      alert("Failed to update match");
    }
  };

  const generateSchedule = async () => {
    if (!isAdmin) return alert("Admin only");
    if (!eventId) return alert("Select an event");
    if (teams.length < 2) return alert("This event needs at least 2 teams. Teams are added when owners register for the active event.");
    if (!venue.trim()) return alert("Enter venue");
    if (!startDate || !endDate) return alert("Select start and end date");

    setGenerating(true);
    try {
      await axios.post(
        `${BACKEND_URL}/api/schedule/generate`,
        {
          eventId,
          teams: teams.map((t) => t._id),
          venue: venue.trim(),
          startDate,
          endDate,
          tournamentType,
          knockoutTeamsCount: Number(knockoutCount)
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      socket.emit("schedule:update", eventId);
      await fetchMatches(eventId);
      setVenue("");
      setStartDate("");
      setEndDate("");
      alert("Schedule generated.");
    } catch (err) {
      alert(err.response?.data?.error || "Failed to generate schedule");
    } finally {
      setGenerating(false);
    }
  };

  const currentEvent = events.find((e) => e._id === eventId) || activeEvent;

  return (
    <div className="schedule-page">
      <div className="schedule-header">
        <h1>Tournament Schedule</h1>
        <p className="schedule-subtitle">
          All matches and teams are scoped to a specific event.
        </p>
      </div>

      <div className="schedule-event-bar">
        <label className="schedule-event-label">Event</label>
        <select
          value={eventId || ""}
          onChange={(e) => setSelectedEventId(e.target.value || null)}
          className="schedule-event-select"
        >
          <option value="">Select event</option>
          {events.map((ev) => (
            <option key={ev._id} value={ev._id}>
              {ev.name} {ev.isActive ? "(Active)" : ""}
            </option>
          ))}
        </select>
        {currentEvent && (
          <span className="schedule-event-badge">
            {currentEvent.name}
          </span>
        )}
      </div>

      {!eventId && (
        <div className="schedule-empty">
          <p>Select an event above to view teams and schedule.</p>
          <p className="schedule-empty-hint">Set an event as Active in Admin so owners can register teams for it.</p>
        </div>
      )}

      {eventId && (
        <>
          <div className="schedule-teams-section">
            <h2>Teams in this event</h2>
            {loading ? (
              <p className="schedule-loading">Loading teams…</p>
            ) : teams.length === 0 ? (
              <p className="schedule-no-teams">No teams yet. Owners register teams for the active event from My Squad.</p>
            ) : (
              <div className="schedule-teams-grid">
                {teams.map((t) => (
                  <div key={t._id} className="schedule-team-chip">
                    {t.logo ? (
                      <img src={t.logo} alt="" className="schedule-team-logo" />
                    ) : (
                      <span className="schedule-team-initial">{t.teamName?.charAt(0) || "?"}</span>
                    )}
                    <span>{t.teamName}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {isAdmin && (
            <div className="schedule-generate-card">
              <h3>Generate schedule (Admin)</h3>
              <div className="schedule-generate-form">
                <div className="schedule-form-row">
                  <select
                    value={tournamentType}
                    onChange={(e) => setTournamentType(e.target.value)}
                    className="schedule-input"
                  >
                    <option value="league">League Only</option>
                    <option value="knockout">Knockout Only</option>
                    <option value="hybrid">League + Knockout</option>
                  </select>
                  {tournamentType !== "league" && (
                    <select
                      value={knockoutCount}
                      onChange={(e) => setKnockoutCount(e.target.value)}
                      className="schedule-input"
                      title="Number of teams qualifying for knockout"
                    >
                      <option value="2">Top 2 (Final)</option>
                      <option value="4">Top 4 (Semi-Finals)</option>
                      <option value="8">Top 8 (Quarter-Finals)</option>
                    </select>
                  )}
                </div>
                <input
                  placeholder="Venue / Ground"
                  value={venue}
                  onChange={(e) => setVenue(e.target.value)}
                  className="schedule-input"
                />
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="schedule-input"
                />
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="schedule-input"
                />
                <button
                  onClick={generateSchedule}
                  disabled={generating || teams.length < 2}
                  className="schedule-generate-btn"
                >
                  {generating ? "Generating…" : "Generate Schedule"}
                </button>
              </div>
            </div>
          )}

          <div className="schedule-matches-section">
            <h2>Matches</h2>
            {loading ? (
              <p className="schedule-loading">Loading matches…</p>
            ) : matches.length === 0 ? (
              <p className="schedule-no-matches">No matches yet. Admin can generate a schedule when there are at least 2 teams.</p>
            ) : (
              <div className="schedule-table-wrap">
                <table className="schedule-table">
                  <thead>
                    <tr>
                      <th>Match</th>
                      <th>Stage</th>
                      <th>Venue</th>
                      <th>Date</th>
                      <th>Time Slot</th>
                      {isAdmin && <th>Actions</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {matches.map((m, i) => (
                      <tr key={m._id || i} className={`schedule-row stage-${(m.stage || "league").replace(/\s/g, "").toLowerCase()}`}>
                        <td>
                          <strong>{m.homeTeam?.teamName ?? "TBD"}</strong>
                          <span className="schedule-vs"> vs </span>
                          <strong>{m.awayTeam?.teamName ?? "TBD"}</strong>
                        </td>
                        <td>{m.stage || "League"}</td>
                        
                        {editingMatchId === m._id ? (
                          <>
                            <td>
                              <input
                                className="schedule-edit-input"
                                value={editFormData.venue}
                                onChange={(e) => setEditFormData({ ...editFormData, venue: e.target.value })}
                              />
                            </td>
                            <td>
                              <input
                                type="date"
                                className="schedule-edit-input"
                                value={editFormData.date}
                                onChange={(e) => setEditFormData({ ...editFormData, date: e.target.value })}
                              />
                            </td>
                            <td>
                              <select
                                className="schedule-edit-input"
                                value={editFormData.timeSlot}
                                onChange={(e) => setEditFormData({ ...editFormData, timeSlot: e.target.value })}
                              >
                                <option value="Morning (9–12)">Morning (9–12)</option>
                                <option value="Afternoon (1–4)">Afternoon (1–4)</option>
                                <option value="Evening (5–8)">Evening (5–8)</option>
                                <option value="Night (8–11)">Night (8–11)</option>
                              </select>
                            </td>
                            {isAdmin && (
                              <td className="schedule-actions">
                                <button className="schedule-save-btn" onClick={() => saveEdit(m._id)}>Save</button>
                                <button className="schedule-cancel-btn" onClick={cancelEdit}>Cancel</button>
                              </td>
                            )}
                          </>
                        ) : (
                          <>
                            <td>{m.venue || "—"}</td>
                            <td>{m.startTime ? new Date(m.startTime).toLocaleDateString() : "—"}</td>
                            <td>{m.timeSlot || "—"}</td>
                            {isAdmin && (
                              <td className="schedule-actions">
                                <button className="schedule-edit-btn" onClick={() => startEdit(m)}>Edit</button>
                                <button className="schedule-delete-btn" onClick={() => deleteMatch(m._id)}>Delete</button>
                              </td>
                            )}
                          </>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default Schedule;
