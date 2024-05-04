let namePrefix = "xiaob";

const SVR_CHR_OTA_CONTROL_ERROR = 0;
const SVR_CHR_OTA_CONTROL_REQUEST = 1;
const SVR_CHR_OTA_CONTROL_REQUEST_ACK = 2;
const SVR_CHR_OTA_CONTROL_PACKETSIZE = 3;
const SVR_CHR_OTA_CONTROL_PACKETSIZE_ACK = 4;
const SVR_CHR_OTA_CONTROL_FINISH = 5;
const SVR_CHR_OTA_CONTROL_FINISH_ACK = 6;
const SVR_CHR_OTA_CONTROL_VERSION = 7;
const SVR_CHR_OTA_CONTROL_VERSION_ACK = 8;


const UUID_SERVICE = "df97245f-325d-41a7-8455-e3e46b87a66f";
const OTA_DATA_UUID = "529839f0-e331-408b-b301-88e5562a294e";
const OTA_CONTROL_UUID = "bc9f8151-e8ba-4327-8d22-65a439f7ca89";

let bluetoothDevice;
let characteristic_data, characteristic_ctr;
const logEl = document.getElementById("log");
const bleStateContainer = document.getElementById("bleState");
const button_connect = document.getElementById("connectBleButton");
const button_disconnect = document.getElementById("disconnectBleButton");
const button_upload = document.getElementById("upload");
const otafile = document.getElementById("otafile");
const progressBar = document.getElementById("progressBar");
const firmware_version = document.getElementById("firmware_version");

const packet_size = 240;

class Queue {
  constructor() {
    this.items = {};
    this.frontIndex = 0;
    this.backIndex = 0;
  }
  push(item) {
    this.items[this.backIndex] = item;
    this.backIndex++;
    // console.log("push: " + item);
  }
  get() {
    if (this.frontIndex < this.backIndex) {
      const item = this.items[this.frontIndex];
      delete this.items[this.frontIndex];
      this.frontIndex++;
      // console.log("get: " + item);
      return item;
    }
    else {
      return null;
    }
  }
}

const ctr_cmd = new Queue();


// 链接蓝牙设备
button_connect.addEventListener("click", async (event) => {
  event.preventDefault();
  if (!isWebBluetoothEnabled()) {
    window.alert("当前浏览器不支持蓝牙设备，请更换浏览器！")
    return;
  }

  try {
    logEl.innerHTML = "";

    // console.log("Requesting Bluetooth Device...");
    consoleWrite("搜索高度表蓝牙服务...", "grey");
    bluetoothDevice = await navigator.bluetooth.requestDevice({
      filters: [
        { services: [UUID_SERVICE] },
        { namePrefix: namePrefix }
      ],
    });

    bluetoothDevice.addEventListener("gattserverdisconnected", (event) => {
      bleStateContainer.innerHTML = "未链接";
      bleStateContainer.style.color = "#d13a30";
    });

    // console.log("Connecting to GATT Server...");
    consoleWrite("正在建立链接...", "grey");
    const server = await bluetoothDevice.gatt.connect();

    // console.log("Getting Service...");
    consoleWrite("正在获取服务...", "grey");
    const service = await server.getPrimaryService(UUID_SERVICE);

    //console.log("Getting Characteristic...");
    consoleWrite("获取服务特征...", "grey");
    // 获取ble服务特征
    characteristic_data = await service.getCharacteristic(OTA_DATA_UUID);
    characteristic_ctr = await service.getCharacteristic(OTA_CONTROL_UUID);

    characteristic_ctr.addEventListener("characteristicvaluechanged", async (event) => {
      // Handle the notification event.
      let ctr_val = event.target.value.getUint8(0);
      console.log("characteristic_ctr value: " + ctr_val);

      if (ctr_val == SVR_CHR_OTA_CONTROL_REQUEST_ACK) {
        ctr_cmd.push("req_ack");
        console.log("ota request acknowledged.");
      }
      else if (ctr_val == SVR_CHR_OTA_CONTROL_PACKETSIZE_ACK) {
        console.log("packet size acknowledged.");
        ctr_cmd.push("packet_ack");
        characteristic_ctr.stopNotifications();
      }
      else if (ctr_val == SVR_CHR_OTA_CONTROL_FINISH_ACK) {
        console.log("ota done acknowledged.");
        ctr_cmd.push("done_ack");
        characteristic_ctr.stopNotifications();
      }
      else if (ctr_val == SVR_CHR_OTA_CONTROL_VERSION_ACK) {
        console.log("firmware version acknowledged.");
        const value = await characteristic_data.readValue();
        const version = new TextDecoder().decode(value);
        firmware_version.innerHTML = version;
        consoleWrite("当前固件版本：" + version)
      }
      else if (ctr_val == SVR_CHR_OTA_CONTROL_ERROR) {
        bluetoothDevice.gatt.disconnect();
        consoleWrite("发生错误...");
        console.log("acknowledged error!.");
        window.alert("发生错误，请重启高度表后再尝试升级！");
        location.reload();
      }
      else {
        console.log("Notification received: %d", ctr_val);
        bluetoothDevice.gatt.disconnect();
      }
    });
    characteristic_ctr.startNotifications();

    consoleWrite("已链接", "grey");
    bluetoothDevice.on;
    bleStateContainer.innerHTML = "已链接";
    bleStateContainer.style.color = "green";

    // 请求版本信息
    console.log("Sending OTA ctr: request.");
    await characteristic_ctr.writeValue(Int8ToArrayBuffer(SVR_CHR_OTA_CONTROL_VERSION));

  } catch (error) {
    console.error(error);
    consoleWrite(error.stack, "#FF878D");
    consoleWrite(error.name + ": " + error.message, "#FF878D");
  }
});

// 断开蓝牙设备
button_disconnect.addEventListener("click", (event) => {
  event.preventDefault();
  bluetoothDevice.gatt.disconnect();
});

// 上传固件
button_upload.addEventListener("click", async (event) => {
  event.preventDefault();
  if (otafile.files.length == 0) {
    window.alert("请选择升级固件!");
    return;
  }
  button_upload.disable = true;

  // 写bin文件尺寸(bytes)
  consoleWrite("文件尺寸：" + otafile.files[0].size + "字节");
  // Write to the characteristic.
  await characteristic_data.writeValueWithResponse(Int32ToArrayBuffer(otafile.files[0].size));

  // write the send size code to OTA Control
  consoleWrite("发送OTA升级请求...");
  await characteristic_ctr.writeValue(Int8ToArrayBuffer(SVR_CHR_OTA_CONTROL_REQUEST));

  delay_ms(100);
  if (ctr_cmd.get() == "req_ack") {
    const reader = new FileReader();
    reader.onload = async () => {
      const buffer = reader.result;
      console.log("file size: " + buffer.byteLength);

      // 发送数据包大小(bytes)
      // consoleWrite("Sending packet size = " + packet_size);
      // console.log("Sending packet size = " + packet_size);
      // Write to the characteristic.
      await characteristic_data.writeValueWithResponse(Int8ToArrayBuffer(packet_size));

      // write the request OP code to OTA Control
      // consoleWrite("Sending packet size.");
      await characteristic_ctr.writeValue(Int8ToArrayBuffer(SVR_CHR_OTA_CONTROL_PACKETSIZE));

      delay_ms(100);
      consoleWrite("发送数据...");
      if (ctr_cmd.get() == "packet_ack") {
        for (let i = 0; i < buffer.byteLength; i += packet_size) {
          const chunk = buffer.slice(i, i + packet_size);
          await characteristic_data.writeValueWithResponse(chunk);
          progressBar.style.width = (i / file.size * 100).toFixed(2) + "%";
          progressBar.innerText = (i / file.size * 100).toFixed(2) + "%";
        }

        // write done OP code to OTA Control
        consoleWrite("数据传输完成.");
        await characteristic_ctr.writeValueWithResponse(Int8ToArrayBuffer(SVR_CHR_OTA_CONTROL_FINISH));

        delay_ms(100);
        if (ctr_cmd.get() == "done_ack") {
          consoleWrite("OTA successful!");
        }
      }
      button_upload.disable = false;
    };

    const file = otafile.files[0];
    reader.readAsArrayBuffer(file);
  }
  else {
    consoleWrite("xiaob did not acknowledge the OTA request.");
    console.log("xiaob did not acknowledge the OTA request.");
    button_upload.disable = false;
  }
});

// 输出窗口日志
function consoleWrite(text, color) {
  const el = document.createElement("div");
  el.innerText = text;
  // var now = new Date();
  // el.innerText = now.toLocaleString() + "->" + text;
  el.style.color = color || "white";
  logEl.append(el);
  if (logEl.children.length > 10) {
    logEl.removeChild(logEl.children[0]);
  }
}

// 判断浏览器是否支持蓝牙设备
function isWebBluetoothEnabled() {
  if (!navigator.bluetooth) {
    console.log("Web Bluetooth API is not available in this browser!");
    bleStateContainer.innerHTML = "当前浏览器不支持蓝牙设备，请更换浏览器!";
    window.alert("当前浏览器不支持蓝牙设备，请更换浏览器!");
    return false
  }
  console.log("Web Bluetooth API supported in this browser.");
  return true
}

function Int8ToArrayBuffer(num) {
  const buffer = new ArrayBuffer(1);
  const view = new Uint8Array(buffer);
  view[0] = num;
  return buffer;
}

function Int32ToArrayBuffer(num) {
  const buffer = new ArrayBuffer(4);
  const view = new Uint32Array(buffer);
  view[0] = num;
  return buffer;
}

// string转arraybuffer，低字节在前（低字节序）
function stringToArrayBuffer(str) {
  var enc = new TextEncoder(); // always utf-8
  return enc.encode(str).buffer;
}

function delay_ms(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
