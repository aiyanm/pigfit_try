# Device Management Implementation - Testing Guide

## ✅ Pre-Testing Checklist

- [x] All TypeScript files compile without errors
- [x] App.tsx now properly initializes services before rendering screens
- [x] useBLE hook has database initialization safety guard
- [x] Database schema includes devices table
- [x] Profile screen integrates scanning modal
- [x] DeviceScanningModal component created with proper animations

---

## 📋 Test Scenarios

### Test 1: App Initialization & Database Creation

**Objective:** Verify database initializes before screens render

**Steps:**

1. Kill the app completely
2. Clear app data (optional, for clean slate)
3. Launch app fresh
4. **Expected:** Loading spinner shows briefly, then navigates to Dashboard
5. **Check console logs for:**
   ```
   🚀 Initializing app services at startup...
   📦 Database already initialized
   ✅ Services ready for data logging and analysis
   🎯 App fully initialized - navigation ready
   ```

**Pass Criteria:** No errors in console, smooth transition from splash to app

---

### Test 2: Pairing a New Device

**Objective:** Verify device pairing flow from Profile screen

**Prerequisites:**

- Have a PigFit device powered on and in Bluetooth range
- Device is **not** previously paired

**Steps:**

1. Navigate to **Profile** tab
2. Scroll to "Device Management" section
3. Tap **"Pair New Device"** button
4. **Expected:** Modal shows "Searching for PigFit_Device..." with pulsing Bluetooth icon
5. When device is found and connected:
   - Modal changes to green checkmark "Device Connected!"
   - Auto-closes after ~1.5 seconds
   - Device appears in Profile with auto-generated name (e.g., "PigFit - Mar 25")
6. **Check console logs for:**
   ```
   >>> Starting BLE scan...
   >>> BLE is PoweredOn, starting scan...
   ✅ Scanned Device: PigFit_Device
   🎉 FOUND PIGFIT DEVICE! Connecting...
   ✅ New device saved with name: PigFit - Mar 25
   ✅ MTU negotiated: 64 bytes
   ✅ Device connected notification sent
   ```

**Pass Criteria:**

- Modal appears and scans
- Device connects without crashing
- Device name appears in Profile
- No database errors in console

---

### Test 3: Verify Database Storage

**Objective:** Confirm device metadata persists in database

**Steps:**

1. After pairing (Test 2), device should show in Profile
2. **Check database** (optional - requires SQLite viewer):
   - Open `pigfit_data.db` with a SQLite browser
   - Check `devices` table
   - **Expected columns:**
     - device_id (the BLE device ID)
     - device_name ("PigFit - Mar 25")
     - device_mac (same as device_id for now)
     - pairing_date (current timestamp)
     - last_connected (current timestamp)

**Pass Criteria:** Device record exists in database with correct fields

---

### Test 4: Rename Device (Inline Editing)

**Objective:** Test changing device name via inline editing

**Prerequisites:** Device is paired and showing in Profile

**Steps:**

1. In Profile, under "Device Management", see your paired device
2. **Tap the device name** (should not tap the arrow, but the name text itself)
3. **Expected:**
   - Device name becomes an editable TextInput field
   - Keyboard appears
   - Text field is highlighted blue with current name selected
4. Clear text and type new name, e.g., "Pig #1"
5. Press **blur/submit** (tap outside or press done on keyboard)
6. **Expected:**
   - TextInput disappears
   - Device name updates to "Pig #1"
   - No visible loading spinner
7. **Check database:**
   - Device name in `devices` table should now be "Pig #1"

**Check console logs for:**

```
✅ Device name updated: <device_id> -> Pig #1
```

**Pass Criteria:**

- Name changes instantly in UI
- Database updates
- No crash on rename

---

### Test 5: Device Persistence Across App Restart

**Objective:** Verify device name & connection history survives app close/reopen

**Prerequisites:** Device is paired and renamed (from Test 4)

**Steps:**

1. Device showing as "Pig #1" in Profile
2. **Force close the app** (swipe away or kill process)
3. **Clear from recent apps** (to ensure full restart)
4. **Reopen the app**
5. **Expected:**
   - App shows loading spinner
   - After initialization completes, navigate to Profile
   - Device still shows with name "Pig #1"
   - No console errors

**Pass Criteria:** Device name persists, nothing lost after restart

---

### Test 6: BLE Connection State Changes

**Objective:** Test device status display when connecting/disconnecting

**Steps:**

1. Device paired and showing in Profile with status "Connected"
2. Turn off the PigFit device
3. **Expected:** Device status should change to "Offline" or "Disconnected" (depending on how BLE reports it)
4. Check console for disconnect notification:
   ```
   ⚠️ Device <name> disconnected
   ```
5. Turn device back on
6. Tap "Pair New Device" again to reconnect (or wait for auto-reconnect if implemented)
7. **Expected:**
   - Modal shows searching
   - Device reconnects
   - Old name loads from database ("Pig #1")

**Pass Criteria:** Device status updates properly on disconnect/reconnect

---

### Test 7: Scanning Timeout

**Objective:** Test error handling when device not found

**Steps:**

1. Navigate to Profile
2. Turn off PigFit device (ensure it's **not** discoverable)
3. Tap "Pair New Device"
4. Modal shows "Searching..." with spinner
5. **Wait 30+ seconds**
6. **Expected:**
   - After 30 seconds, modal shows error state:
     - Red X icon
     - "Device Not Found" message
     - "Try Again" button
7. Tap "Try Again"
8. **Expected:** Modal closes and rescans

**Pass Criteria:** Timeout triggers error state, no hanging spinner

---

### Test 8: User Cancels Pairing

**Objective:** Test cancel button during scan

**Steps:**

1. Navigate to Profile
2. Tap "Pair New Device"
3. Modal shows searching with "Cancel" button
4. Tap **Cancel** button
5. **Expected:**
   - Modal closes immediately
   - BLE scanning stops
   - Profile screen is visible again

**Pass Criteria:** Cancel works smoothly, no lingering scans

---

## 🔍 Manual Quick Checks

### Startup Flow

```
1. Kill app
2. Launch
3. See loading spinner 2-3 seconds
4. Go to Profile tab
5. Check Device Management section exists
6. No red error banners
```

### Database File Exists

```
1. App files folder → pigfit_data.db should exist (usually in app documents)
2. Can view with SQLite viewer to confirm devices table
```

### No Console Errors

```
1. Open Metro/React Native debugger console
2. After pairing, check no red ❌ errors
3. Blue ⚠️ warnings are OK, red errors are NOT OK
```

---

## 🐛 Common Issues & Troubleshooting

### Issue: "No devices connected" after pairing

**Cause:** Device connected but name didn't save to state  
**Solution:** Check if `dbService.getDevice()` is returning a result. Add console.log in connectToDevice

### Issue: App crashes when tapping "Pair Device"

**Cause:** Database not initialized or permission denied  
**Solution:** Check App.tsx initialization is awaiting properly, check Android/iOS permissions

### Issue: Renamed device name reverts after app restart

**Cause:** Database not persisting the update  
**Solution:** Check `updateDeviceName()` function completed without error, verify database file exists

### Issue: Modal shows success but device doesn't appear

**Cause:** State update didn't propagate, or DB save failed silently  
**Solution:** Check console for "✅ New device saved" log, check Profile.tsx useEffect dependencies

### Issue: 30-second timeout triggers immediately

**Cause:** Timeout logic issue  
**Solution:** Verify `setTimeout` uses 30000ms, check if `isScanning` state transitions correctly

---

## ✅ Test Completion Checklist

- [ ] Test 1: App initialization (no crash, proper flow)
- [ ] Test 2: Pairing works (modal → modal closes → device shows)
- [ ] Test 3: Database stores device (verify SQLite)
- [ ] Test 4: Rename works (name updates in UI & DB)
- [ ] Test 5: Persistence (restart app, name still there)
- [ ] Test 6: Connection state changes (connect/disconnect)
- [ ] Test 7: Timeout error handling (waits 30s, shows error)
- [ ] Test 8: Cancel button works (stops scan, closes modal)

---

## 📊 Success Metrics

If all 8 tests pass:

- ✅ Device management feature is **fully functional**
- ✅ Database integration is **stable**
- ✅ User experience is **smooth**
- ✅ Error handling is **robust**

If any test fails:

1. Check console logs (search for ❌ or ⚠️)
2. Verify device is powered on and in range
3. Check Bluetooth permissions are granted
4. Review relevant test section for expected behavior

---

## 🔧 Debugging Tips

**Enable all logs:**

- Search console for: 🎉, ✅, ❌, ⚠️ emojis
- Filter by tags: "useBLE", "dbService", "DeviceModal"

**Check state in React DevTools:**

- Inspect Profile component's `connectedDevice` and `connectedDeviceName` props
- Verify modal `isScanning` state transitions

**Database inspection:**

- Query: `SELECT * FROM devices;` should return paired device record
- Check `device_name` updates when you rename
- Verify `last_connected` timestamp updates on reconnect

**BLE debugging:**

- Check ">>> BLE" logs in console (BLE state transitions)
- Verify "FOUND PIGFIT DEVICE" message appears when device found
- Check MTU negotiation completed (64 bytes expected)

---

## 📝 Notes

- Device name changes are saved **immediately** (no "save" button needed)
- Modal auto-closes **1.5 seconds after successful connection**
- Database supports queuing if operations fail
- BLE scan automatically stops when device found
- All operations log detailed console messages for debugging

**Last Updated:** March 25, 2026  
**Status:** Ready for Testing
