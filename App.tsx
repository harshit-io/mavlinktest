import React, { useState, useEffect } from 'react';
import { ToastAndroid } from 'react-native';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
} from 'react-native';
import { connectionManager, ConnectionMode } from 'lib-mavlink-connect';

const App: React.FC = () => {
  const [selectedMode, setSelectedMode] = useState<ConnectionMode>('TCP');
  const [isConnected, setIsConnected] = useState(false);
  const [mavlinkData, setMavlinkData] = useState<string>('No data');
  const [showDropdown, setShowDropdown] = useState(false);

  const modes: ConnectionMode[] = ['TCP', 'UDP', 'SERIAL'];

  useEffect(() => {
    let interval: NodeJS.Timeout;
    
    if (isConnected) {
      interval = setInterval(async () => {
        try {
          const data = await connectionManager.getMavlinkDataJson();
          setMavlinkData(data || 'No data received');
        } catch (error) {
          setMavlinkData('Error fetching data');
        }
      }, 1000);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isConnected]);

  const handleConnect = async () => {
    try {
      if (isConnected) {
        await connectionManager.stopConnection(selectedMode);
        setIsConnected(false);
        setMavlinkData('Disconnected');
      } else {
        await connectionManager.initConnection(selectedMode);
        setIsConnected(true);
        setMavlinkData('Connected - waiting for data...');
      }
    } catch (error) {
      Alert.alert('Connection Error', error instanceof Error ? error.message : 'Unknown error');
    }
  };

  const sendCommand = async (commandName: string) => {
    if (!isConnected) {
      Alert.alert('Error', 'Not connected to MAVLink');
      return;
    }
    
    try {
      // TODO: Replace 'yourActualFunctionName' with actual function calls
      switch (commandName) {
        case 'ARM':
          await connectionManager.sendGuidedCommand('ARM');
          ToastAndroid.show('ARM command sent', ToastAndroid.SHORT);
          break;
        case 'DISARM':
          // await connectionManager.yourActualDisarmFunction();
          Alert.alert('Command', 'DISARM command sent');
          break;
        case 'TAKEOFF':
          // await connectionManager.yourActualTakeoffFunction();
          Alert.alert('Command', 'TAKEOFF command sent');
          break;
        case 'LAND':
          // await connectionManager.yourActualLandFunction();
          Alert.alert('Command', 'LAND command sent');
          break;
        case 'RTL':
          // await connectionManager.yourActualRTLFunction();
          Alert.alert('Command', 'RTL command sent');
          break;
      }
    } catch (error) {
      Alert.alert('Command Error', error instanceof Error ? error.message : 'Unknown error');
    }
  };

  return (
    <View style={styles.container}>
      {/* Left Panel - Controls */}
      <View style={styles.leftPanel}>
        <Text style={styles.title}>MAVLink Connect</Text>

        {/* Mode Selector */}
        <TouchableOpacity 
          style={styles.dropdown}
          onPress={() => setShowDropdown(!showDropdown)}
        >
          <Text style={styles.dropdownText}>Mode: {selectedMode}</Text>
        </TouchableOpacity>

        {/* Dropdown Options */}
        {showDropdown && (
          <View style={styles.dropdownOptions}>
            {modes.map((mode) => (
              <TouchableOpacity
                key={mode}
                style={[
                  styles.dropdownOption,
                  selectedMode === mode && styles.selectedOption
                ]}
                onPress={() => {
                  setSelectedMode(mode);
                  setShowDropdown(false);
                }}
              >
                <Text style={[
                  styles.optionText,
                  selectedMode === mode && styles.selectedOptionText
                ]}>
                  {mode}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Connect Button */}
        <TouchableOpacity 
          style={[styles.connectButton, isConnected && styles.disconnectButton]}
          onPress={handleConnect}
        >
          <Text style={styles.connectButtonText}>
            {isConnected ? 'Disconnect' : 'Connect'}
          </Text>
        </TouchableOpacity>

        {/* Command Buttons */}
        <Text style={styles.sectionTitle}>MAVLink Commands</Text>
        <View style={styles.commandGrid}>
          {['ARM', 'DISARM', 'TAKEOFF', 'LAND', 'RTL'].map((cmd) => (
            <TouchableOpacity
              key={cmd}
              style={[styles.commandButton, !isConnected && styles.disabledButton]}
              onPress={() => sendCommand(cmd)}
              disabled={!isConnected}
            >
              <Text style={[styles.commandText, !isConnected && styles.disabledText]}>
                {cmd}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Right Panel - Data Display */}
      <View style={styles.rightPanel}>
        <Text style={styles.dataTitle}>MAVLink Data Stream</Text>
        <ScrollView style={styles.dataScrollView}>
          <Text style={styles.dataText}>{mavlinkData}</Text>
        </ScrollView>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: '#121212',
    padding: 20,
  },
  leftPanel: {
    width: 300,
    paddingRight: 20,
  },
  rightPanel: {
    flex: 1,
    paddingLeft: 20,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 20,
  },
  dropdown: {
    backgroundColor: '#333333',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#555555',
  },
  dropdownText: {
    color: '#FFFFFF',
    fontSize: 14,
  },
  dropdownOptions: {
    backgroundColor: '#333333',
    borderRadius: 8,
    marginBottom: 15,
    borderWidth: 1,
    borderColor: '#555555',
  },
  dropdownOption: {
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#555555',
  },
  selectedOption: {
    backgroundColor: '#555555',
  },
  optionText: {
    color: '#FFFFFF',
    fontSize: 14,
  },
  selectedOptionText: {
    fontWeight: 'bold',
  },
  connectButton: {
    backgroundColor: '#4CAF50',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
    marginBottom: 20,
  },
  disconnectButton: {
    backgroundColor: '#F44336',
  },
  connectButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  sectionTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  commandGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  commandButton: {
    backgroundColor: '#2196F3',
    borderRadius: 6,
    padding: 10,
    width: '48%',
    marginBottom: 8,
    alignItems: 'center',
  },
  disabledButton: {
    backgroundColor: '#666666',
  },
  commandText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: 'bold',
  },
  disabledText: {
    color: '#AAAAAA',
  },
  dataTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  dataScrollView: {
    flex: 1,
    backgroundColor: '#1E1E1E',
    borderRadius: 8,
    padding: 15,
  },
  dataText: {
    color: '#E0E0E0',
    fontSize: 11,
    fontFamily: 'monospace',
    lineHeight: 14,
  },
});

export default App;