/**
 * OuterTuneActivity - Revenge Plugin
 * Shows your OuterTune (YouTube Music) currently playing track as Discord Rich Presence.
 *
 * Requires OuterTune (patched) to be running on the same device.
 * The app exposes a local HTTP server on localhost:9863.
 *
 * Endpoint: GET http://localhost:9863/now-playing
 */

const { plugin, storage } = vendetta;
const {
  React,
  ReactNative: { View, Text, TextInput, Switch, ScrollView, StyleSheet },
} = vendetta.metro.common;

const { FluxDispatcher } = vendetta.metro.common;

// ── Storage helpers ───────────────────────────────────────────────────────────

function getStorage(key, fallback) {
  return storage[key] !== undefined ? storage[key] : fallback;
}

// ── Fetch now-playing from OuterTune ─────────────────────────────────────────

async function fetchNowPlaying() {
  const port = getStorage("port", 9863);
  const res = await fetch(`http://localhost:${port}/now-playing`, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.json();
}

// ── Rich Presence ─────────────────────────────────────────────────────────────

function setActivity(track) {
  if (!track || !track.isPlaying) {
    FluxDispatcher.dispatch({ type: "LOCAL_ACTIVITY_UPDATE", activity: null });
    return;
  }

  const activity = {
    name: "OuterTune",
    type: 2, // "Listening to"
    details: track.title || "Unknown Track",
    state: track.artist ? `by ${track.artist}` : undefined,
    timestamps: { start: Date.now() - (track.position || 0) },
    flags: 1,
  };

  if (track.thumbnailUrl && !track.isLocal) {
    activity.assets = {
      large_image: track.thumbnailUrl,
      large_text: track.album || track.artist || "OuterTune",
    };
  }

  FluxDispatcher.dispatch({ type: "LOCAL_ACTIVITY_UPDATE", activity });
}

// ── Polling ───────────────────────────────────────────────────────────────────

let pollInterval = null;
let lastTrackKey = null;

async function poll() {
  try {
    if (!getStorage("enabled", true)) {
      setActivity(null);
      return;
    }

    const track = await fetchNowPlaying();
    const key = track.isPlaying ? `${track.songId}::playing` : "paused";

    if (key !== lastTrackKey) {
      lastTrackKey = key;
      setActivity(track);
    }
  } catch {
    if (lastTrackKey !== "offline") {
      lastTrackKey = "offline";
      setActivity(null);
    }
  }
}

function startPolling() {
  stopPolling();
  const seconds = Math.max(5, getStorage("pollSeconds", 10));
  poll();
  pollInterval = setInterval(poll, seconds * 1000);
}

function stopPolling() {
  if (pollInterval !== null) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
}

// ── Settings Page ─────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: "#1e1f22" },
  label: {
    color: "#b5bac1", fontSize: 12, fontWeight: "600",
    textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6, marginTop: 16,
  },
  input: {
    backgroundColor: "#2b2d31", color: "#dbdee1", borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 10, fontSize: 14,
    borderWidth: 1, borderColor: "#3d3f44",
  },
  row: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    backgroundColor: "#2b2d31", borderRadius: 8,
    paddingHorizontal: 14, paddingVertical: 12, marginTop: 16,
  },
  rowText: { color: "#dbdee1", fontSize: 15 },
  hint: { color: "#80848e", fontSize: 12, marginTop: 6 },
  heading: { color: "#dbdee1", fontSize: 18, fontWeight: "700", marginBottom: 4 },
  subheading: { color: "#80848e", fontSize: 13, marginBottom: 8 },
  statusOk: { color: "#23a559", fontSize: 13, marginTop: 12, textAlign: "center" },
  statusOff: { color: "#80848e", fontSize: 13, marginTop: 12, textAlign: "center" },
  statusErr: { color: "#f23f42", fontSize: 13, marginTop: 12, textAlign: "center" },
  trackCard: {
    backgroundColor: "#2b2d31", borderRadius: 8, padding: 12, marginTop: 16,
    borderWidth: 1, borderColor: "#3d3f44",
  },
  trackTitle: { color: "#dbdee1", fontSize: 14, fontWeight: "600" },
  trackArtist: { color: "#b5bac1", fontSize: 13, marginTop: 2 },
  trackAlbum: { color: "#4e5058", fontSize: 12, marginTop: 2 },
});

function SettingsPage() {
  const [port, setPort] = React.useState(String(getStorage("port", 9863)));
  const [pollSeconds, setPollSeconds] = React.useState(String(getStorage("pollSeconds", 10)));
  const [enabled, setEnabled] = React.useState(getStorage("enabled", true));
  const [status, setStatus] = React.useState({ msg: "", type: "off" });
  const [liveTrack, setLiveTrack] = React.useState(null);

  async function testConnection() {
    try {
      const p = parseInt(port, 10) || 9863;
      const res = await fetch(`http://localhost:${p}/now-playing`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setLiveTrack(data);
      setStatus({
        msg: data.isPlaying ? `✓ Connected! Now playing: ${data.title}` : "✓ Connected! OuterTune is paused.",
        type: "ok",
      });
    } catch (e) {
      setLiveTrack(null);
      setStatus({ msg: "✗ Can't reach OuterTune. Is the patched app running?", type: "err" });
    }
    setTimeout(() => setStatus({ msg: "", type: "off" }), 5000);
  }

  function save(updates) {
    Object.assign(storage, updates);
    startPolling();
  }

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.heading}>OuterTune Activity</Text>
      <Text style={styles.subheading}>
        Shows your OuterTune (YouTube Music) track as Discord Rich Presence.{"\n"}
        Requires the patched OuterTune APK installed on this device.
      </Text>

      {/* Enable */}
      <View style={styles.row}>
        <Text style={styles.rowText}>Enable Plugin</Text>
        <Switch
          value={enabled}
          onValueChange={(val) => {
            setEnabled(val);
            storage.enabled = val;
            if (val) startPolling();
            else { stopPolling(); setActivity(null); }
          }}
          thumbColor={enabled ? "#5865f2" : "#72767d"}
          trackColor={{ false: "#3d3f44", true: "#4752c4" }}
        />
      </View>

      {/* Port */}
      <Text style={styles.label}>API Port</Text>
      <TextInput
        style={styles.input}
        placeholder="9863"
        placeholderTextColor="#4e5058"
        value={port}
        keyboardType="numeric"
        onChangeText={setPort}
        onBlur={() => { const n = parseInt(port, 10) || 9863; setPort(String(n)); save({ port: n }); }}
      />
      <Text style={styles.hint}>Default: 9863 — only change if you modified the patch.</Text>

      {/* Poll interval */}
      <Text style={styles.label}>Poll Interval (seconds)</Text>
      <TextInput
        style={styles.input}
        placeholder="10"
        placeholderTextColor="#4e5058"
        value={pollSeconds}
        keyboardType="numeric"
        onChangeText={setPollSeconds}
        onBlur={() => {
          const n = Math.max(5, parseInt(pollSeconds, 10) || 10);
          setPollSeconds(String(n));
          save({ pollSeconds: n });
        }}
      />
      <Text style={styles.hint}>Minimum 5 seconds.</Text>

      {/* Test */}
      <View style={[styles.row, { marginTop: 20 }]}>
        <Text style={styles.rowText}>Test Connection</Text>
        <Text style={{ color: "#5865f2", fontSize: 14, fontWeight: "600" }} onPress={testConnection}>
          Test →
        </Text>
      </View>

      {/* Status */}
      {status.msg ? (
        <Text style={status.type === "ok" ? styles.statusOk : styles.statusErr}>{status.msg}</Text>
      ) : (
        <Text style={styles.statusOff}>{enabled ? "✓ Polling active" : "⚠ Plugin disabled"}</Text>
      )}

      {/* Live track preview */}
      {liveTrack?.isPlaying && (
        <View style={styles.trackCard}>
          <Text style={styles.trackTitle}>{liveTrack.title}</Text>
          <Text style={styles.trackArtist}>{liveTrack.artist}</Text>
          {liveTrack.album ? <Text style={styles.trackAlbum}>{liveTrack.album}</Text> : null}
        </View>
      )}
    </ScrollView>
  );
}

// ── Plugin Entry Point ────────────────────────────────────────────────────────

export default {
  onLoad() { startPolling(); },
  onUnload() { stopPolling(); setActivity(null); },
  settings: SettingsPage,
};
