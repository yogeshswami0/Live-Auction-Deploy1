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
                        <td>{m.venue || "—"}</td>
                        <td>{m.startTime ? new Date(m.startTime).toLocaleDateString() : "—"}</td>
                        <td>{m.timeSlot || "—"}</td>
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
