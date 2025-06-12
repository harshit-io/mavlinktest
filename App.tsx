import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { connectionManager } from 'lib-mavlink-connect';

export default function App() {
  const [isConnected, setIsConnected] = useState(false);
  const [mavlinkData, setMavlinkData] = useState<any[]>([]);

  useEffect(() => {
    const listener = connectionManager.addEventListener('MavlinkDataUpdate', (event) => {
      try {
        const data = JSON.parse(event.payload);
        if (data && Object.keys(data).length > 0) {
          setMavlinkData(prev => [...prev.slice(-19), {
            ...data,
            time: new Date().toLocaleTimeString()
          }]);
        }
      } catch (e) {
        console.warn('Parse error:', e);
      }
    });

    return () => {
      connectionManager.removeEventListener('MavlinkDataUpdate');
      connectionManager.cleanup();
    };
  }, []);

  const toggleConnection = async () => {
    try {
      if (isConnected) {
        await connectionManager.stopConnection('SERIAL');
        setIsConnected(false);
        setMavlinkData([]);
      } else {
        await connectionManager.initConnection('SERIAL');
        setIsConnected(true);
      }
    } catch (error) {
      console.error('Connection error:', error);
    }
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={[styles.button, { backgroundColor: isConnected ? '#f44336' : '#4caf50' }]}
        onPress={toggleConnection}
      >
        <Text style={styles.buttonText}>
          {isConnected ? 'DISCONNECT' : 'CONNECT'}
        </Text>
      </TouchableOpacity>

      <ScrollView style={styles.log}>
        <Text style={styles.title}>MAVLink Data ({mavlinkData.length})</Text>
        {mavlinkData.map((data, i) => (
          <View key={i} style={styles.entry}>
            <Text style={styles.time}>{data.time}</Text>
            <Text style={styles.data}>
              ID: {data.msgId || 'N/A'} | Type: {data.type || 'N/A'}
            </Text>
            {data.payload && (
              <Text style={styles.payload}>{JSON.stringify(data.payload).slice(0, 100)}...</Text>
            )}
          </View>
        ))}
        {mavlinkData.length === 0 && (
          <Text style={styles.empty}>
            {isConnected ? 'Waiting for data...' : 'Press CONNECT to start'}
          </Text>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000', padding: 20 },
  button: { padding: 15, borderRadius: 8, alignItems: 'center', marginBottom: 20 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  log: { flex: 1, backgroundColor: '#111', borderRadius: 8, padding: 15 },
  title: { color: '#fff', fontSize: 18, fontWeight: 'bold', marginBottom: 15 },
  entry: { marginBottom: 10, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: '#333' },
  time: { color: '#888', fontSize: 12 },
  data: { color: '#fff', fontSize: 14, marginTop: 2 },
  payload: { color: '#ccc', fontSize: 12, marginTop: 2 },
  empty: { color: '#666', textAlign: 'center', marginTop: 20 }
});