module.exports = {
  apiReference:
    (options = {}) =>
    (_request, response) => {
      response.status(200).json({
        title: 'Scalar mock',
        spec: options.content,
      });
    },
};
