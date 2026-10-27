const os = require("node:os");
const original = os.networkInterfaces;
os.networkInterfaces = function () {
  try {
    return original();
  } catch (error) {
    if (!String(error).includes("uv_interface_addresses")) throw error;
    return {
      lo: [
        {
          address: "127.0.0.1",
          netmask: "255.0.0.0",
          family: "IPv4",
          mac: "00:00:00:00:00:00",
          internal: true,
          cidr: "127.0.0.1/8",
        },
      ],
    };
  }
};
