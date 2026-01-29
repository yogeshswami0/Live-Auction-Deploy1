module.exports = (io) => {
  io.on("connection", (socket) => {
    socket.on("scheduleUpdated", (data) => {
      socket.broadcast.emit("refreshSchedule", data);
    });
  });
};
